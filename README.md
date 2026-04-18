# Protocol-Lens

> A passive AI-powered DevTools extension that sits between your frontend and backend, 
> catching API contract violations the moment they happen — before they reach production.

---

## The Problem

Modern web development has a hidden failure mode. Your backend team ships a change — 
a field goes nullable, a type changes from string to number, a new required field appears. 
Your frontend has no idea. The OpenAPI spec gets updated, or maybe it doesn't. Either way, 
your TypeScript types are now lying to you.

You find out in one of three ways:
- A user reports a bug
- Sentry catches a runtime crash
- You accidentally click the broken flow in QA

All three are too late. The damage is done.

Protocol-Lens catches it the moment it happens.

---

## What Protocol-Lens Does

Protocol-Lens is a Chrome DevTools extension — it lives as a tab inside Chrome's 
DevTools, the same place as Elements, Network, and Console.

While you browse your app normally, Protocol-Lens:

**1. Intercepts every API call silently**
It watches every JSON response your app receives using Chrome's DevTools network API. 
You don't change your code, add middleware, or configure anything. It just works.

**2. Runs AI inference on real traffic**
Instead of just seeing `"created_at": "2024-01-15"` and calling it a string, 
Protocol-Lens sends the response to an AI model that recognizes it as an ISO-8601 
datetime. It identifies UUIDs, emails, currency amounts, nullable fields, optional 
fields, enums — the semantic meaning behind raw JSON types. Things a normal type 
generator would miss entirely.

**3. Compares live traffic against your OpenAPI spec**
Paste your Swagger/OpenAPI spec URL into the panel. Protocol-Lens diffs what your 
API is *actually returning* against what the documentation *says* it should return. 
Every mismatch is flagged as a Contract Drift with a severity level:

- **Error** — type mismatch, unexpected null, missing required field
- **Warning** — undocumented field appearing in live traffic  
- **Info** — optional spec field not yet seen in traffic

**4. Generates TypeScript interfaces and Zod schemas**
From real traffic, not from documentation. Copy them directly into your codebase. 
No manual type writing, no guessing, no outdated types from a spec that nobody 
maintains.

**5. Exports MSW mock server configs**
One click generates a `handlers.ts` file you drop into your project. Your frontend 
can now run completely offline with realistic mock data that matches actual API 
behavior — not what the docs claim the behavior is.

---

## Real World Applications

**For frontend developers:**
Stop writing types by hand. Browse your app for 30 seconds and Protocol-Lens 
generates accurate TypeScript interfaces for every endpoint you hit. When the 
backend changes something, you'll know immediately instead of finding out from 
a user bug report.

**For full-stack teams:**
Use it as a living contract test. Run Protocol-Lens during your regular development 
workflow — if the drift badge lights up red, someone changed the API without 
updating the spec. Catch it in development, not production.

**For QA engineers:**
During manual testing sessions, Protocol-Lens is silently building a picture of 
what the API actually does. Export the mock configs at the end of a session and 
you have a realistic test fixture set that reflects real production behavior.

**For API-first teams:**
When onboarding onto a new codebase or third-party API, Protocol-Lens lets you 
understand the actual API behavior in minutes. Instead of reading through 
documentation that may be stale, just browse the app and watch the schemas 
build up in real time.

**For indie developers:**
Working alone means you're both the frontend and backend developer. Protocol-Lens 
gives you instant type safety without the overhead of maintaining a separate 
contract testing setup. It's the lightweight alternative to tools like Pact or 
Dredd that require significant configuration.

---

## How It Compares

| Tool | Passive | AI inference | Drift detection | Mock export |
|------|---------|--------------|-----------------|-------------|
| Protocol-Lens | ✓ | ✓ | ✓ | ✓ |
| Postman | ✗ | ✗ | ✗ | Partial |
| Swagger UI | ✗ | ✗ | ✗ | ✗ |
| Pact | ✗ | ✗ | ✓ | ✗ |
| Stoplight | ✗ | ✗ | Partial | ✗ |
| Browser DevTools | ✓ | ✗ | ✗ | ✗ |

The key differentiator is *passivity*. Every other tool requires you to write 
tests, configure pipelines, or manually execute requests. Protocol-Lens provides 
value the moment you open DevTools, with zero setup from the developer.

---

## Installation

### Prerequisites
- Chrome browser
- Node.js 18+
- A free [Groq API key](https://console.groq.com) (takes 2 minutes to get)

### Setup

```bash
git clone https://github.com/your-username/protocol-lens
cd protocol-lens
npm install
```

Create a `.env` file in the root:
VITE_GROQ_API_KEY=your_groq_api_key_here 

Build the extension:
```bash
npm run build
```

Load into Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## Usage

1. Open any web app in Chrome
2. Open DevTools (`Cmd+Option+I` on Mac, `F12` on Windows)
3. Click the **Protocol-Lens** tab
4. Paste your OpenAPI/Swagger spec URL into the spec loader and click LOAD
5. Browse your app normally — requests appear in the left panel automatically
6. Click any request to see:
   - **Payload** — the raw JSON response
   - **Schema** — AI-inferred types with semantic annotations
   - **Drift** — contract violations against your spec
7. Click the mock exporter at the bottom to download a ready-to-use `handlers.ts`

### Testing with the PetStore demo
If you want to try it without your own app:
- Spec URL: `https://petstore3.swagger.io/api/v3/openapi.json`
- Browse: `https://petstore3.swagger.io`
- Click "Try it out" on any endpoint and execute it

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension runtime | Chrome Extension Manifest V3 |
| UI framework | React 19 + TypeScript |
| Build tool | Vite 6 |
| AI inference | Groq API (Llama 3.3 70B) |
| Schema generation | Zod + zod-to-ts |
| Persistence | IndexedDB via idb |
| Mock export | MSW v2 compatible |

---

## Privacy

Protocol-Lens runs entirely in your browser. Your API traffic is never sent to 
any server except the AI inference call to Groq, which only receives a sample 
of the JSON response structure — not your actual data values. No analytics, 
no telemetry, no data collection.

The AI inference call sends the *shape* of your responses (field names and 
example values) to Groq for type analysis. If you're working with sensitive 
APIs, you can use the local Ollama mode instead (see Configuration).

---

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_GROQ_API_KEY` | Groq API key for inference | Required |

---

## License

MIT — use it, fork it, ship it.