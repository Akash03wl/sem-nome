import { useEffect, useRef, useState } from "react";
import type { EverythingStatus, FileHit, WebShortcut } from "../lib/types";
import { calculate } from "./calc";
import { matchShortcut } from "./web";

/** Arquivos só para textos com 2+ letras que não são conta nem palavra-chave de internet. */
export function fileSearchEnabled(query: string, shortcuts: WebShortcut[]): boolean {
  const q = query.trim();
  return q.length >= 2 && calculate(q) === null && matchShortcut(q, shortcuts) === null;
}

/**
 * Busca arquivos `delay` ms depois da última tecla. Respostas que chegam depois
 * de uma busca mais nova são descartadas.
 */
export function useFileSearch(
  query: string,
  enabled: boolean,
  fetcher: (q: string) => Promise<FileHit[] | EverythingStatus>,
  delay = 150,
): { hits: FileHit[]; status: EverythingStatus | null } {
  const [hits, setHits] = useState<FileHit[]>([]);
  const [status, setStatus] = useState<EverythingStatus | null>(null);
  const seq = useRef(0);
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  useEffect(() => {
    const id = ++seq.current;
    // Resultados do texto anterior somem na hora: Enter nunca abre um arquivo de outra busca.
    setHits([]);
    if (!enabled) {
      setHits([]);
      setStatus(null);
      return;
    }
    const q = query.trim();
    const timer = setTimeout(async () => {
      const r = await fetchRef.current(q);
      if (id !== seq.current) return;
      if (Array.isArray(r)) {
        setHits(r);
        setStatus(null);
      } else {
        setHits([]);
        setStatus(r === "ready" ? null : r);
      }
    }, delay);
    return () => clearTimeout(timer);
  }, [query, enabled, delay]);

  return { hits, status };
}
