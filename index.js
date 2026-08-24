const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const QUERIES = [
  (p) => `"${p}" official company platform`,
  (p) => `"${p}" official payments PayPal Payoneer Airtm bank transfer`,
  (p) => `"${p}" Mozambique tasks workers`,
  (p) => `"${p}" Moçambique pagamentos M-Pesa e-Mola`,
  (p) => `"${p}" reviews complaints payout delays account blocked`,
  (p) => `"${p}" 2026 2025 latest update`
];

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {"content-type":"application/json; charset=utf-8", ...CORS}
  });
}

function cleanText(s, max=8000) {
  return String(s || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function domainOf(url) {
  try { return new URL(url).hostname.replace(/^www\./,""); } catch { return ""; }
}

function dedupe(results) {
  const seen = new Set();
  return results.filter(x => {
    const key = x.url || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function braveSearch(query, env) {
  if (!env.BRAVE_SEARCH_API_KEY) throw new Error("BRAVE_SEARCH_API_KEY não configurada.");
  const u = new URL("https://api.search.brave.com/res/v1/web/search");
  u.searchParams.set("q", query);
  u.searchParams.set("count", "10");
  u.searchParams.set("country", "MZ");
  u.searchParams.set("search_lang", "pt");
  u.searchParams.set("ui_lang", "pt-BR");
  u.searchParams.set("safesearch", "moderate");
  u.searchParams.set("extra_snippets", "true");

  const r = await fetch(u, {
    headers: {
      "Accept": "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": env.BRAVE_SEARCH_API_KEY
    }
  });
  if (!r.ok) throw new Error(`Brave Search HTTP ${r.status}`);
  const d = await r.json();
  return (d.web?.results || []).map(x => ({
    title: x.title || "",
    url: x.url || "",
    description: x.description || "",
    extra: Array.isArray(x.extra_snippets) ? x.extra_snippets.join(" ") : ""
  }));
}

async function fetchPage(url) {
  try {
    const r = await fetch(url, {
      headers: {"User-Agent":"RadarDigital/1.0 (verification research bot)"}
    });
    if (!r.ok) return {ok:false, status:r.status, text:""};
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("text/plain")) {
      return {ok:false, status:r.status, text:""};
    }
    const text = cleanText(await r.text(), 9000);
    return {ok:true, status:r.status, text};
  } catch {
    return {ok:false, status:0, text:""};
  }
}

function sourceType(url, title="") {
  const d = domainOf(url);
  const officialHints = [
    "linkedin.com/company/", "crunchbase.com/organization/" // intentionally not treated as official below
  ];
  // We do not guess that a domain is official solely from its name.
  return "Fonte Web";
}

function buildEvidence(platform, results) {
  return results.map((x,i) => ({
    id: i+1,
    title: x.title,
    url: x.url,
    domain: domainOf(x.url),
    snippet: `${x.description} ${x.extra}`.trim().slice(0,1800),
    page_text: x.page_text || "",
    source_type: "Fonte Web"
  }));
}

async function callAI(prompt, env) {
  if (!env.AI) throw new Error("Binding Workers AI não configurada.");
  const resp = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      {
        role: "system",
        content:
          "Você é o motor de verificação do RADAR DIGITAL. " +
          "Use SOMENTE as evidências fornecidas. Não invente fatos, pagamentos, países, tarefas, empresas ou links. " +
          "Se a evidência não confirmar uma afirmação, escreva exatamente: NÃO FOI POSSÍVEL CONFIRMAR. " +
          "Diferencie disponibilidade internacional de disponibilidade em Moçambique. " +
          "Não trate snippets ou opiniões como prova de pagamento. " +
          "Não declare que uma informação é juridicamente comprovada. " +
          "Responda em português claro."
      },
      { role: "user", content: prompt }
    ]
  });
  return resp?.response || "";
}

function parseJsonLoose(text) {
  try { return JSON.parse(text); } catch {}
  const m = String(text).match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

async function investigate(platform, env) {
  const raw = [];
  for (const makeQuery of QUERIES) {
    const q = makeQuery(platform);
    const rs = await braveSearch(q, env);
    raw.push(...rs);
  }
  let results = dedupe(raw).slice(0, 35);

  // Fetch a limited number of pages for primary evidence.
  const fetched = [];
  for (const x of results.slice(0, 12)) {
    const p = await fetchPage(x.url);
    fetched.push({...x, page_text:p.ok ? p.text : ""});
  }
  results = fetched.concat(results.slice(12));

  const evidence = buildEvidence(platform, results);

  const prompt = `
PLATAFORMA: ${platform}

TAREFA:
1) Identifique, quando possível, a empresa responsável e a natureza da plataforma.
2) Explique o funcionamento apenas com evidência.
3) Verifique especificamente Moçambique: tarefas para moçambicanos e condições aplicáveis.
4) Verifique pagamentos em Moçambique, separando claramente PayPal, Payoneer, Airtm, transferência bancária/SWIFT, M-Pesa e e-Mola.
5) Verifique reclamações, atrasos, bloqueios e problemas de saque, distinguindo relatos de fatos confirmados.
6) Dê prioridade a páginas oficiais e informações recentes de 2025/2026.
7) Produza 7 pontos curtos.
8) A informação processada deve ter aproximadamente 500–600 caracteres, sem inventar.
9) Liste apenas fontes realmente usadas.

DEVOLVA SOMENTE JSON VÁLIDO:
{
  "verification_level": "ALTO|MÉDIO|BAIXO",
  "processed_information": "texto com os 7 pontos numerados",
  "source_ids_used": [1,2],
  "warnings": ["..."]
}

EVIDÊNCIAS:
${JSON.stringify(evidence)}
`;

  const aiText = await callAI(prompt, env);
  const parsed = parseJsonLoose(aiText);
  if (!parsed) throw new Error("O motor de IA não devolveu JSON verificável.");

  const ids = Array.isArray(parsed.source_ids_used) ? parsed.source_ids_used : [];
  const sources = ids.map(id => evidence.find(e => e.id === id)).filter(Boolean).map(e => ({
    name: e.title || e.domain,
    url: e.url,
    type: e.source_type,
    domain: e.domain
  }));

  return {
    platform,
    checked_at: new Date().toISOString(),
    verification_level: parsed.verification_level || "BAIXO",
    source_count: sources.length,
    sources,
    processed_information: parsed.processed_information || "NÃO FOI POSSÍVEL CONFIRMAR.",
    warnings: parsed.warnings || []
  };
}

async function compare(body, env) {
  const prompt = `
Compare dois resultados sobre a mesma plataforma.
Resultado do RADAR:
${body.radar}

Resultado externo:
${body.external}

Não decida qual é verdadeiro apenas pela semelhança textual.
Identifique divergências factuais e diga quais pontos precisam de nova verificação nas fontes.
Não invente fatos.
Retorne JSON:
{"level":"CONSISTENTE|DIVERGENTE|INCONCLUSIVO","summary":"resumo curto"}
`;
  const txt = await callAI(prompt, env);
  return parseJsonLoose(txt) || {level:"INCONCLUSIVO", summary:"NÃO FOI POSSÍVEL CONFIRMAR."};
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, {headers:CORS});
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ok:true, service:"Radar Digital v3", time:new Date().toISOString()});
    }

    if (url.pathname === "/api/investigate" && request.method === "POST") {
      try {
        const body = await request.json();
        const platform = String(body.platform || "").trim();
        if (!platform || platform.length > 120) return json({error:"Nome da plataforma inválido."},400);
        const result = await investigate(platform, env);
        return json(result);
      } catch (e) {
        return json({error:e.message || "Erro interno."},500);
      }
    }

    if (url.pathname === "/api/compare" && request.method === "POST") {
      try {
        const body = await request.json();
        if (!body.radar || !body.external) return json({error:"Dados insuficientes."},400);
        return json(await compare(body, env));
      } catch (e) {
        return json({error:e.message || "Erro interno."},500);
      }
    }

    // Serve the public frontend for everything else.
    return env.ASSETS.fetch(request);
  }
};
