/**
 * AI Service for generating 5 lines using NVIDIA Nemotron Ultra or any OpenAI-compatible API
 */
const { addLog } = require('./logger');

const DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3-ultra-550b-a55b';

/**
 * Generates 5 clean lines of technical/developer content using NVIDIA Nemotron-3 Ultra
 */
async function generateFiveLines() {
  const apiKey = 
    process.env.NEMOTRON_API_KEY ||
    process.env.NEMOTRON3_API_KEY ||
    process.env.NEMOTRON_ULTRA_API_KEY ||
    process.env.AI_API_KEY ||
    process.env.NVIDIA_API_KEY;

  const baseUrl = (process.env.AI_BASE_URL || process.env.NEMOTRON_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const model = process.env.AI_MODEL || process.env.NEMOTRON_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    addLog('WARN', 'Nemotron API key not set (NEMOTRON_API_KEY / AI_API_KEY). Using intelligent offline generator for 5 lines.');
    return getFallbackLines('API key not configured in environment variables');
  }

  const promptTopics = [
    'modern software architecture and clean code principles',
    'distributed systems reliability and fault tolerance',
    'database indexing and query performance optimization',
    'web performance, caching strategies, and Core Web Vitals',
    'DevOps, CI/CD automation, and cloud infrastructure efficiency',
    'API design, idempotency, and RESTful best practices',
    'concurrency patterns, async programming, and memory management',
    'developer productivity, debugging mental models, and testing tactics'
  ];

  const randomTopic = promptTopics[Math.floor(Math.random() * promptTopics.length)];

  const systemPrompt = `You are a distinguished principal software engineer and technical writer.
Generate EXACTLY 5 distinct, concise, high-value lines regarding ${randomTopic}.
Each line must be a complete, punchy sentence offering deep technical insight, architectural advice, or code wisdom.
RULES:
1. Output EXACTLY 5 lines separated by newlines.
2. DO NOT use markdown headers (like #), asterisks, bullet dashes, or numbers.
3. DO NOT include greetings, intro text ("Here are 5 lines:"), or conclusions.
4. Just 5 raw, insightful lines of pure technical gold.`;

  try {
    addLog('INFO', `Requesting 5 lines from AI (${model}) via NVIDIA NIM API...`);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Generate 5 lines of high-value developer insights on ${randomTopic}.` }
        ],
        temperature: 0.6,
        max_tokens: 450,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI API HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || '';

    // Split into individual lines and sanitize
    const lines = rawContent
      .split('\n')
      .map(line => line.trim())
      // Strip any accidental markdown bullets or numbering
      .map(line => line.replace(/^[-*•\d.]+\s+/, '').trim())
      .filter(line => line.length > 5);

    if (lines.length >= 5) {
      const selectedLines = lines.slice(0, 5);
      addLog('SUCCESS', `Successfully generated 5 lines via ${model}`);
      return selectedLines;
    } else if (lines.length > 0) {
      // Pad to 5 lines if slightly short
      while (lines.length < 5) {
        lines.push(`System optimization checkpoint ${lines.length + 1}: maintain high cohesion and low coupling.`);
      }
      addLog('SUCCESS', `Generated lines via ${model} (adjusted to 5 lines)`);
      return lines.slice(0, 5);
    } else {
      throw new Error('AI returned an empty response');
    }
  } catch (error) {
    addLog('ERROR', `AI generation failed: ${error.message}. Using fallback lines.`);
    return getFallbackLines(`Generation error: ${error.message}`);
  }
}

/**
 * High-quality fallback generator when offline or before API key is provided
 */
function getFallbackLines(reason) {
  const fallbacks = [
    [
      "Design systems for graceful degradation: every distributed call must have explicit timeouts and retry budgets.",
      "Prefer immutable data structures in concurrent pipelines to eliminate race conditions without lock contention.",
      "Database indexes are not free; evaluate write amplification against read frequency during schema migrations.",
      "Write self-documenting code with clear domain nomenclature instead of relying on stale external wikis.",
      "Automate repetitive manual operations early: human memory is the most fragile component in production."
    ],
    [
      "Cache invalidation requires deterministic naming conventions and explicit time-to-live policies.",
      "Observe three pillars of telemetry: structured logs, dimensional metrics, and distributed traces.",
      "Favor boring, battle-tested technologies in core critical paths over experimental frameworks.",
      "Profile real production memory profiles before applying premature memory or CPU optimizations.",
      "Small, atomic commits pushed frequently reduce merge conflicts and accelerate deployment velocity."
    ],
    [
      "Ensure API endpoints are strictly idempotent to tolerate transient network retries safely.",
      "Decouple stateful services from compute workers to enable seamless horizontal autoscaling.",
      "Treat infrastructure as version-controlled code with reproducible declarative environments.",
      "Continuous testing in CI is cheaper than emergency hotfixing in production environments.",
      "Keep dependencies lean; auditing third-party vulnerabilities is a fundamental security duty."
    ]
  ];

  const set = fallbacks[Math.floor(Math.random() * fallbacks.length)];
  return set;
}

module.exports = {
  generateFiveLines,
  DEFAULT_MODEL,
  DEFAULT_BASE_URL,
};
