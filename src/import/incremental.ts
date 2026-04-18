import { createHash } from "node:crypto";
import { fetch } from "undici";
import { getInstanceOfValues } from "./_filters";
import { withRetry } from "./_retry";
import type { WikidataEntity } from "./_types";
import { hasEntityChanged, trackEntity } from "./state";

interface IncrementalQueryResult {
  entity: WikidataEntity;
  modificationTime: Date;
  revisionId: string;
  changedProperties: string[];
}

interface SparqlResponse {
  results?: {
    bindings?: SparqlBinding[];
  };
}

interface SparqlBinding {
  entity: { value: string };
  modified?: { value: string };
  revid?: { value: string };
  prop?: { value: string };
}

export type { SparqlBinding };

export async function fetchChangedEntities(
  since: Date,
  watchedProperties: string[] = ["P136", "P179", "P577"],
): Promise<IncrementalQueryResult[]> {
  const endpoint = "https://query.wikidata.org/sparql";
  const sinceIso = since.toISOString();

  const query = `
    SELECT ?entity ?modified ?revid ?prop WHERE {
      ?entity wdt:P31 ?type .
      VALUES ?type { wd:Q11424 wd:Q5398426 wd:Q639669 wd:Q21191270 wd:Q15703242 wd:Q486972 wd:Q187453 wd:Q5668224 wd:Q15711898 wd:Q15711882 }
      
      OPTIONAL {
        ?entity schema:dateModified ?modified .
        FILTER (?modified >= "${sinceIso}"^^xsd:dateTime)
      }
      
      OPTIONAL {
        ?entity wikibase:revisionId ?revid .
      }
      
      OPTIONAL {
        ?entity ?prop ?value .
        FILTER (?prop IN (${watchedProperties.map((p) => `wd:${p}`).join(", ")}))
      }
    }
    ORDER BY ?modified
    LIMIT 1000
  `;

  return await withRetry(
    async () => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "User-Agent": "donguri-import/1.0",
          Accept: "application/sparql-results+json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `query=${encodeURIComponent(query)}`,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`SPARQL HTTP ${response.status}: ${text}`);
      }

      const data = (await response.json()) as SparqlResponse;
      const bindings = data.results?.bindings || [];

      return bindings.map(
        (r): IncrementalQueryResult => ({
          entity: {
            id: r.entity.value.replace("http://www.wikidata.org/entity/", ""),
          } as WikidataEntity,
          modificationTime: new Date(r.modified?.value || "1970-01-01"),
          revisionId: r.revid?.value || "",
          changedProperties: r.prop
            ? [r.prop.value.replace("http://www.wikidata.org/prop/direct/", "")]
            : [],
        }),
      );
    },
    "SPARQL incremental query",
    { maxRetries: 5, maxDelayMs: 60_000 },
  );
}

export function hashEntity(entity: WikidataEntity): string {
  const canonical = {
    id: entity.id,
    type: getInstanceOfValues(entity).join(","),
    labels: entity.labels?.en,
    claims: entity.claims ? Object.keys(entity.claims).sort() : [],
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

export function shouldUpdateEntity(incoming: IncrementalQueryResult): boolean {
  const incomingHash = hashEntity(incoming.entity);

  if (!hasEntityChanged(incoming.entity.id, incomingHash)) {
    return false;
  }

  return true;
}

export function trackEntityChange(
  wikidataId: string,
  revisionId: string,
  dataHash: string,
  properties: string[],
): void {
  trackEntity(wikidataId, revisionId, dataHash, properties);
}
