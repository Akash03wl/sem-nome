import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Confirmação por segundo clique: `ask(chave)` devolve `true` só se a mesma chave
 * já estava armada; senão arma por `ms` milissegundos e devolve `false`.
 */
export function useConfirm(ms = 3000): { armed: string | null; ask(key: string): boolean; reset(): void } {
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);

  const reset = useCallback(() => {
    clear();
    setArmed(null);
  }, []);

  const ask = useCallback(
    (key: string) => {
      clear();
      if (armed === key) {
        setArmed(null);
        return true;
      }
      setArmed(key);
      timer.current = setTimeout(() => setArmed(null), ms);
      return false;
    },
    [armed, ms],
  );

  return { armed, ask, reset };
}
