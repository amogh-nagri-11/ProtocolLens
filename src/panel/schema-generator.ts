// import { z } from 'zod'; 
import type { FieldSchema, InferredSchema } from './gemini';

function fieldToZod(field: FieldSchema): string {
    console.log("fieldToZod called")
    let zodType: string; 

    // map the more specific semantic types first
    switch(field.semanticType) {
        case 'ISO-8601-datetime': 
            zodType = 'z.string().datetime({ offset: true })'
            break 
        case 'uuid': 
            zodType = 'z.string().uuid()' 
            break 
        case 'email': 
            zodType = 'z.string().email()'
            break 
        case 'url': 
            zodType = 'z.string().url()' 
            break 
        default: 
            // fall back to raw json type 
            switch(field.type) {
                case 'string': 
                    zodType = 'z.string()' 
                    break 
                case 'number': 
                    zodType = 'z.number()' 
                    break 
                case 'boolean': 
                    zodType = 'z.boolean()' 
                    break 
                case 'array': 
                    zodType = 'z.array(z.unknown())'
                    break 
                case 'object': 
                    zodType = 'z.object({}).passthrough()'
                    break 
                default:
                    zodType = 'z.unknown'
            }
    }

    if (field.nullable) zodType += '.nullable()'; 
    if (field.optional) zodType += '.optional()';

    return zodType;
} 

function FieldToTs(field: FieldSchema): string { 
    console.log("fieldtots called")
    let tsType: string 

    switch (field.semanticType) {
        case 'ISO-8601-datetime':
        case 'uuid': 
        case 'email': 
        case 'url': 
        case 'hex-color': 
        case 'base-64': 
        case 'jwt': 
        case 'phone': 
        case 'country-code': 
        case 'language-code':
            tsType = 'string' 
            break 
        default: 
            switch (field.type) {
                case 'string':
                    tsType = 'string'
                    break 
                case 'number': 
                    tsType = 'number' 
                    break 
                case 'boolean': 
                    tsType = 'boolean' 
                    break 
                case 'array': 
                    tsType = 'unknown[]' 
                    break 
                case 'object': 
                    tsType = 'Return<string, unknown>' 
                    break 
                default: 
                    tsType = 'unknown'
            }
    }

    if (field.nullable) tsType += ' | null'; 

    return tsType; 
}

function buildZodSchema (fields: Record<string, FieldSchema>): string {
    console.log("buildzodschema called")
    const topLevel: Record<string, string> = {} 

    for (const [name, field] of Object.entries(fields)) {
        if (!name.includes('.')) {
            topLevel[name] = fieldToZod(field); 
        }
    }

    const lines = Object.entries(topLevel)
        .map(([name, zodStr]) => `${name}: ${zodStr}, `)
        .join('\n'); 

    return `z.object(\n${lines}\n)`
}

function buildTsInterface(
    name: string, 
    fields: Record<string, FieldSchema>
): string {
    console.log("buildtsinterface called")
    const lines = Object.entries(fields)
        .filter(([fieldName]) => !fieldName.includes('.'))
        .map(([fieldName, field]) => {
            const tsType = FieldToTs(field)
            const optional = field.optional ? '?' : ''
            return `${fieldName}${optional}: ${tsType}`
        })
        .join('\n')
    
    return `interface ${name} {\n${lines}\n}`
}

// Main export — generates both Zod and TS from an inferred schema
export function generateCode(schema: InferredSchema): {
    zodSchema: string
    tsInterface: string
    schemaName: string
} {
    console.log("generatecode called")
    // Turn "GET /api/users" into "GetApiUsers"
    const schemaName = schema.endpoint
        .replace(/[^a-zA-Z0-9/]/g, ' ')
        .split(/[\s/]+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join('')

    const zodSchema = `const ${schemaName}Schema = ${buildZodSchema(schema.fields)}`
    const tsInterface = buildTsInterface(schemaName, schema.fields)

    // Validate the zod schema actually parses (catches bugs in generation) - no use for this block hence commented out
    // try {
    //     // We just check it's valid JS — actual runtime validation happens in the app
    //     new Function('z', `return ${buildZodSchema(schema.fields)}`)(z)
    // } catch (err) {
    //     console.warn('Generated Zod schema has issues:', err)
    // }

    return { zodSchema, tsInterface, schemaName }
}