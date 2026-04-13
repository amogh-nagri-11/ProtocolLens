import Groq from 'groq-sdk'

const client = new Groq({
  apiKey: import.meta.env.VITE_GROQ_API_KEY as string,
  dangerouslyAllowBrowser: true
})

export type FieldSchema = {
  type: string
  semanticType: string
  nullable: boolean
  optional: boolean
  confidence: number
  notes: string
}

export type InferredSchema = {
  endpoint: string
  fields: Record<string, FieldSchema>
  inferredAt: number
}

export async function inferSchema(
  method: string,
  path: string,
  samples: unknown[],
  retries = 2
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

  try {
    const completion = await client.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 2000,
    })

    const text = completion.choices[0]?.message?.content?.trim() ?? ''
    const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(clean)

    return {
      endpoint: `${method} ${path}`,
      fields: parsed.fields,
      inferredAt: Date.now(),
    }
  } catch (err: unknown) {
    if (retries > 0 && err instanceof Error && err.message.includes('429')) {
      await new Promise(resolve => setTimeout(resolve, 10000))
      return inferSchema(method, path, samples, retries - 1)
    }
    throw err
  }
}