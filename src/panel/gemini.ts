import { GoogleGenerativeAI } from '@google/generative-ai'

const apiKey = import.meta.env.VITE_GEMINI_API_KEY as string
const genAI = new GoogleGenerativeAI(apiKey)
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-8b' })

// What we expect Gemini to return for each field
export type FieldSchema = {
  type: string           // e.g. "string", "number", "boolean", "array", "object"
  semanticType: string   // e.g. "ISO-8601-datetime", "uuid", "email", "currency", "url", "unknown"
  nullable: boolean      // true if any sample had null for this field
  optional: boolean      // true if field was missing in some samples
  confidence: number     // 0-1, how confident Gemini is
  notes: string          // any extra observations
}

export type InferredSchema = {
  endpoint: string
  fields: Record<string, FieldSchema>
  inferredAt: number
}

export async function inferSchema(
  method: string,
  path: string,
  samples: unknown[]
): Promise<InferredSchema> {
  const prompt = `
You are an API schema inference engine. Analyze these ${samples.length} JSON response samples from the endpoint "${method} ${path}" and infer the schema.

For each field in the response, determine:
- "type": the JSON type (string, number, boolean, array, object, null)
- "semanticType": the real-world meaning. Use specific values like:
    "ISO-8601-datetime", "uuid", "email", "url", "phone", "currency-amount",
    "country-code", "language-code", "hex-color", "base64", "jwt", "unknown"
- "nullable": true if ANY sample has null for this field
- "optional": true if the field is MISSING in any sample
- "confidence": 0.0 to 1.0
- "notes": anything unusual, like "sometimes returns string, sometimes number"

Samples:
${JSON.stringify(samples, null, 2)}

Respond ONLY with a valid JSON object. No markdown, no backticks, no explanation.
Format:
{
  "fields": {
    "fieldName": {
      "type": "string",
      "semanticType": "uuid",
      "nullable": false,
      "optional": false,
      "confidence": 0.95,
      "notes": ""
    }
  }
}

For nested objects, use dot notation for field names (e.g. "user.id", "user.email").
`

  const result = await model.generateContent(prompt)
  const text = result.response.text().trim()

  // Strip markdown code fences if Gemini adds them anyway
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
  const parsed = JSON.parse(clean)

  return {
    endpoint: `${method} ${path}`,
    fields: parsed.fields,
    inferredAt: Date.now(),
  }
}