import type { OpenAPIV3 } from 'openapi-types'
import type { InferredSchema } from './gemini'

console.log("file loaded drift.js");

export type DriftSeverity = 'error' | 'warning' | 'info'

export type DriftItem = {
  field: string
  severity: DriftSeverity
  message: string
  expected?: string
  observed?: string
}

export type DriftReport = {
  endpoint: string
  drifts: DriftItem[]
  checkedAt: number
}

function getBasePaths(spec: OpenAPIV3.Document): string[] {
  console.log("getBasePaths called")
  if (!spec.servers) return []

  return spec.servers.map(server => {
    try {
      // OpenAPI server URLs are often relative paths like "/api/v3".
      // Give URL() a dummy origin so both absolute and relative values parse.
      const url = new URL(server.url, 'https://example.com')
      return url.pathname.replace(/\/$/, '')
    } catch {
      return ''
    }
  })
}

function normalizePath(
  rawPath: string,
  basePaths: string[]
): string {
  console.log("normalized paths called")
  for (const base of basePaths) {
    if (rawPath.startsWith(base)) {
      const stripped = rawPath.slice(base.length)
      return stripped || '/'
    }
  }
  return rawPath
}

// Converts an OpenAPI schema type to our simple type string
function openApiTypeToSimple(schema: OpenAPIV3.SchemaObject): string {
  console.log("openApiTypeTosimple called")
  if (schema.type) return schema.type
  if (schema.oneOf || schema.anyOf) return 'union'
  if (schema.allOf) return 'object'
  return 'unknown'
}

// Checks if a field's inferred type is compatible with the spec type
function isTypeCompatible(inferred: string, specType: string): boolean {
  console.log("isTypeCompatible called")
  if (inferred === specType) return true
  // number covers integer
  if (specType === 'integer' && inferred === 'number') return true
  if (specType === 'number' && inferred === 'integer') return true
  return false
}

// Finds the response schema for a given method + path in an OpenAPI spec
export function findSpecSchema(
  spec: OpenAPIV3.Document,
  method: string,
  path: string
): OpenAPIV3.SchemaObject | null {
  console.log("findSpecSchema called")

  // Normalize method to lowercase
  const lowerMethod = method.toLowerCase() as keyof OpenAPIV3.PathItemObject

  const basePath = getBasePaths(spec)
  const normalizedPath = normalizePath(path, basePath) 

  console.log("Base path: ", basePath)
  console.log("Normalized path: ", normalizedPath)

  const pathsToTry = [normalizedPath, path]; 

  let pathItem

  for (const tryPath of pathsToTry) {
    // Exact match 
    pathItem = spec.paths?.[tryPath]
    if (pathItem) break 

    // Path parameter match e.g. /pet/123 → /pet/{petId}
    for (const specPath of Object.keys(spec.paths || {})) {
      const pattern = specPath.replace(/\{[^}]+\}/g, '[^/]+')
      const regex = new RegExp(`^${pattern}$`)
      if (regex.test(tryPath)) {
        pathItem = spec.paths![specPath]
        break
      }
    }
    if (pathItem) break 
  }


  console.log("spec paths: ", Object.keys(spec.paths || {}));
  console.log("pahtitem: ",pathItem);

  if (!pathItem) return null

  const operation = pathItem[lowerMethod] as OpenAPIV3.OperationObject | undefined
  if (!operation) return null

  // Get 200 response schema
  const response200 = operation.responses?.['200'] as OpenAPIV3.ResponseObject | undefined
  if (!response200) return null

  const content = response200.content?.['application/json']
  if (!content?.schema) return null

  // Resolve $ref if present
  const schema = content.schema as OpenAPIV3.SchemaObject
  return schema
}

// Flattens a nested OpenAPI schema into dot-notation fields
function flattenSchema(
  schema: OpenAPIV3.SchemaObject,
  prefix = '',
  spec?: OpenAPIV3.Document
): Record<string, OpenAPIV3.SchemaObject> {
  const fields: Record<string, OpenAPIV3.SchemaObject> = {}

  if (schema.type === 'object' || schema.properties) {
    for (const [key, value] of Object.entries(schema.properties || {})) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      const fieldSchema = value as OpenAPIV3.SchemaObject
      fields[fullKey] = fieldSchema

      // Recurse into nested objects
      if (fieldSchema.type === 'object' || fieldSchema.properties) {
        Object.assign(fields, flattenSchema(fieldSchema, fullKey, spec))
      }
    }
  }

  return fields
}

// Main drift analysis function
export function analyzeDrift(
  inferred: InferredSchema,
  spec: OpenAPIV3.Document,
  method: string,
  path: string
): DriftReport {
  console.log('analyzing drift');

  const drifts: DriftItem[] = []
  const specSchema = findSpecSchema(spec, method, path)

  if (!specSchema) {
    return {
      endpoint: `${method} ${path}`,
      drifts: [{
        field: '*',
        severity: 'info',
        message: `No spec found for ${method} ${path}`,
      }],
      checkedAt: Date.now(),
    }
  }

  const specFields = flattenSchema(specSchema)
  const inferredFields = inferred.fields

  // Check each inferred field against the spec
  for (const [fieldName, inferredField] of Object.entries(inferredFields)) {
    const specField = specFields[fieldName]

    if (!specField) {
      // Field exists in real traffic but not in spec
      drifts.push({
        field: fieldName,
        severity: 'warning',
        message: `Field "${fieldName}" found in live traffic but not in spec`,
        observed: inferredField.type,
      })
      continue
    }

    const specType = openApiTypeToSimple(specField)

    // Type mismatch
    if (!isTypeCompatible(inferredField.type, specType)) {
      drifts.push({
        field: fieldName,
        severity: 'error',
        message: `Type mismatch for "${fieldName}"`,
        expected: specType,
        observed: inferredField.type,
      })
    }

    // Nullable drift — spec says not nullable but we observed nulls
    const specNullable = specField.nullable === true ||
      (Array.isArray(specField.type) && specField.type.includes('null'))

    if (inferredField.nullable && !specNullable) {
      drifts.push({
        field: fieldName,
        severity: 'error',
        message: `"${fieldName}" is null in live traffic but spec says it's required/non-nullable`,
        expected: 'non-nullable',
        observed: 'nullable',
      })
    }
  }

  // Check spec fields that are missing from live traffic
  for (const [fieldName, specField] of Object.entries(specFields)) {
    if (!inferredFields[fieldName]) {
      const required = Array.isArray(specSchema.required) &&
        specSchema.required.includes(fieldName)

      if (required) {
        drifts.push({
          field: fieldName,
          severity: 'error',
          message: `Required field "${fieldName}" from spec is missing in live traffic`,
          expected: openApiTypeToSimple(specField),
        })
      } else {
        drifts.push({
          field: fieldName,
          severity: 'info',
          message: `Optional field "${fieldName}" from spec not seen in live traffic yet`,
          expected: openApiTypeToSimple(specField),
        })
      }
    }
  }

  return {
    endpoint: `${method} ${path}`,
    drifts,
    checkedAt: Date.now(),
  }
}
