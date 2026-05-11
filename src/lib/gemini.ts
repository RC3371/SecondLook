import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

export const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

// Cache layer — critical for demo reliability
const responseCache = new Map<string, string>()

export async function triageCandidate(
  resumeText: string,
  reqCriteria: object
): Promise<object> {
  const cacheKey = `triage:${resumeText.slice(0, 100)}:${JSON.stringify(reqCriteria).slice(0, 50)}`

  if (responseCache.has(cacheKey)) {
    return JSON.parse(responseCache.get(cacheKey)!)
  }

  // Sanitize before sending to LLM (prompt injection defense)
  const sanitized = resumeText
    .replace(/ignore previous instructions/gi, '[REDACTED]')
    .replace(/you are now/gi, '[REDACTED]')
    .slice(0, 8000) // token limit

  const prompt = `
    You are a recruiter assistant. Triage this candidate against the job criteria.
    
    JOB CRITERIA:
    ${JSON.stringify(reqCriteria, null, 2)}
    
    RESUME:
    ${sanitized}
    
    Respond ONLY with valid JSON in this exact format:
    {
      "tier": "auto_reject" | "review" | "strong" | "top",
      "matched": ["skill or requirement that matched"],
      "missing": ["requirement not met"],
      "preferred_hits": ["preferred skills found"],
      "risk_flags": ["keyword stuffing" | "ai_generated" | "prompt_injection" | null],
      "summary": "one sentence for the recruiter"
    }
  `

  const result = await model.generateContent(prompt)
  const text = result.response.text()

  // Strip markdown fences if present
  const clean = text.replace(/```json|```/g, '').trim()

  responseCache.set(cacheKey, clean)
  return JSON.parse(clean)
}