import { useState, type FormEvent } from "react";
import type { Item, Library } from "../lib/types";
import { KIND_LABEL } from "../items/actions";

export interface ModeFormProps {
  library: Library;
  /** Modo sendo editado; ausente = novo modo. */
  initial?: Item;
  /** Devolve `null` se salvou, ou a mensagem de erro. */
  onSubmit(name: string, members: string[]): Promise<string | null>;
  onCancel(): void;
}

/** Nome do modo e os itens que abrem juntos, na ordem em que foram marcados. */
export function ModeForm({ library, initial, onSubmit, onCancel }: ModeFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [members, setMembers] = useState<string[]>(initial?.members ?? []);
  const [error, setError] = useState<string | null>(null);
  const choices = library.items.filter((i) => i.kind !== "mode");

  function toggle(id: string) {
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(await onSubmit(name, members));
  }

  return (
    <form className="items-form mode-form" onSubmit={submit}>
      <label>
        Nome do modo
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Modo estudo" />
      </label>
      <fieldset className="mode-choices">
        <legend>Itens que abrem juntos ({members.length})</legend>
        {choices.length === 0 && <p className="items-empty">Adicione itens ao Vitra primeiro.</p>}
        {choices.map((i) => (
          <label key={i.id} className="mode-choice">
            <input type="checkbox" aria-label={i.name} checked={members.includes(i.id)} onChange={() => toggle(i.id)} />
            <span>{i.name}</span>
            <span className="mode-choice-kind">
              {members.includes(i.id) ? `${members.indexOf(i.id) + 1}º · ` : ""}
              {KIND_LABEL[i.kind]}
            </span>
          </label>
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="items-alert">
          {error}
        </p>
      )}
      <div className="mode-actions">
        <button type="submit" className="items-primary">
          Salvar modo
        </button>
        <button type="button" className="items-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
