import { useEffect, useState } from "react";

type Loader = (id: string) => Promise<string | null>;

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | null>>();
let loader: Loader = async () => null;

/** Define quem busca os ícones (em produção, `api.getIcon`). */
export function setIconLoader(fn: Loader) {
  loader = fn;
}

/** Ícone do item como data URL, buscado uma vez por id e guardado em memória. */
export function useIcon(id: string): string | null {
  const [src, setSrc] = useState<string | null>(cache.get(id) ?? null);
  useEffect(() => {
    if (cache.has(id)) {
      setSrc(cache.get(id) ?? null);
      return;
    }
    let alive = true;
    let p = pending.get(id);
    if (!p) {
      p = loader(id).then((v) => {
        cache.set(id, v);
        pending.delete(id);
        return v;
      });
      pending.set(id, p);
    }
    p.then((v) => alive && setSrc(v));
    return () => {
      alive = false;
    };
  }, [id]);
  return src;
}
