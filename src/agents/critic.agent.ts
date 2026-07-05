import { BaseAgent, GROQ_MODEL } from './base.agent.js'
import { scratchpad } from '../memory/scratchpad.js'
import { scoreSource } from '../tools/score-source.tool.js'
import { criticPrompt } from '../prompts/critic.prompt.js'
import { CriticReport } from '@synthex/shared/types/research.types'

const CONFIDENCE_THRESHOLD = parseFloat(process.env.CRITIC_CONFIDENCE_THRESHOLD ?? '0.7')

export class CriticAgent extends BaseAgent {
  constructor() {
    super('critic')
  }

  async run(jobId: string, input: { round?: number; queryType?: string } = {}): Promise<CriticReport> {
    const round = input.round ?? 1
    this.emit(jobId, { type: 'thinking', payload: { message: 'Reviewing all findings adversarially…', round } })

    const findings = await scratchpad.getFindings(jobId)
    if (findings.length === 0) {
      const empty: CriticReport = {
        jobId, round, confidenceScore: 0, approved: false,
        reasoning: 'No findings were produced — nothing to evaluate.',
        contradictions: [], singleSourceClaims: [],
        gaps: ['No sources were found. Broaden the search terms and try alternative strategies.'],
      }
      await scratchpad.setCriticReport(jobId, empty)
      this.emit(jobId, { type: 'score', payload: { confidenceScore: 0, approved: false, round } })
      return empty
    }

    // 1. Objective per-source credibility — each finding scored against its peers
    // so corroboration is real (independent domains), not guessed.
    const allUrls = findings.map((f) => f.sourceUrl)
    const scored = await Promise.all(
      findings.map(async (f) => {
        const peers = allUrls.filter((u) => u !== f.sourceUrl)
        const cred = await scoreSource(f.sourceUrl, peers)
        return { finding: f, cred }
      })
    )

    const distinctDomains = new Set(scored.map((s) => {
      try { return new URL(s.finding.sourceUrl).hostname.replace(/^www\./, '') } catch { return s.finding.sourceUrl }
    })).size

    this.emit(jobId, { type: 'thinking', payload: { message: `Scoring ${findings.length} findings across ${distinctDomains} distinct domains`, round } })

    // 2. Adversarial LLM analysis over the scored evidence.
    const evidence = scored.map((s, i) =>
      `[${i + 1}] ${s.finding.content}\n    source: ${s.finding.sourceTitle} (${s.finding.sourceUrl})\n    authority: ${s.cred.domainAuthority.toFixed(2)}, date: ${s.cred.publicationDate ?? 'unknown'}, corroborating domains: ${s.cred.corroborationCount}`
    ).join('\n\n')

    const msg = await this.client.chat.completions.create({
      model: GROQ_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: criticPrompt },
        {
          role: 'user',
          content: `Query type: ${input.queryType ?? 'exploratory'}\nResearch round: ${round}\nDistinct source domains: ${distinctDomains}\n\nFindings to evaluate:\n${evidence}`,
        },
      ],
    })

    const raw = msg.choices[0]?.message?.content ?? ''
    const parsed = this.parseReport(raw)

    const report: CriticReport = {
      jobId,
      round,
      confidenceScore: parsed.confidenceScore,
      approved: parsed.confidenceScore >= CONFIDENCE_THRESHOLD,
      reasoning: parsed.reasoning,
      contradictions: parsed.contradictions,
      singleSourceClaims: parsed.singleSourceClaims,
      gaps: parsed.gaps,
    }

    // 3. Write the flags back to the scratchpad and emit the verdict.
    await scratchpad.setCriticReport(jobId, report)
    this.emit(jobId, {
      type: 'score',
      payload: {
        confidenceScore: report.confidenceScore,
        approved: report.approved,
        contradictions: report.contradictions.length,
        gaps: report.gaps,
        round,
      },
    })

    return report
  }

  private parseReport(raw: string): {
    confidenceScore: number
    reasoning: string
    contradictions: string[]
    singleSourceClaims: string[]
    gaps: string[]
  } {
    const fallback = { confidenceScore: 0.5, reasoning: 'Could not parse critic output.', contradictions: [], singleSourceClaims: [], gaps: [] }
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return fallback
    try {
      const p = JSON.parse(match[0]) as Partial<{
        confidenceScore: number; reasoning: string
        contradictions: string[]; singleSourceClaims: string[]; gaps: string[]
      }>
      const score = typeof p.confidenceScore === 'number' ? Math.max(0, Math.min(1, p.confidenceScore)) : 0.5
      return {
        confidenceScore: score,
        reasoning: p.reasoning ?? '',
        contradictions: Array.isArray(p.contradictions) ? p.contradictions : [],
        singleSourceClaims: Array.isArray(p.singleSourceClaims) ? p.singleSourceClaims : [],
        gaps: Array.isArray(p.gaps) ? p.gaps : [],
      }
    } catch {
      return fallback
    }
  }
}
