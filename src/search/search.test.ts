import { describe, it, expect } from "vitest";
import { normalize } from "./normalize";
import { score } from "./fuzzy";
import { calculate, formatNumber } from "./calc";
import { matchShortcut } from "./web";
import { search, searchVault } from "./search";
import type { Discovered, Library, WebShortcut } from "../lib/types";

const shortcuts: WebShortcut[] = [
  { keyword: "g", name: "Google", url: "https://www.google.com/search?q={q}" },
  { keyword: "yt", name: "YouTube", url: "https://www.youtube.com/results?search_query={q}" },
];

describe("normalize", () => {
  it("tira acentos, maiúsculas e espaços repetidos", () => {
    expect(normalize("  Música   Ção ")).toBe("musica cao");
  });
});

describe("fuzzy", () => {
  it("igual, prefixo, palavra, iniciais, contém", () => {
    expect(score("steam", "Steam")).toBe(100);
    expect(score("ste", "Steam")).toBe(90);
    expect(score("studio", "Visual Studio Code")).toBe(80);
    expect(score("vsc", "Visual Studio Code")).toBe(75);
    expect(score("tea", "Steam")).toBe(60);
  });

  it("ignora acentos e maiúsculas", () => {
    expect(score("musica", "Música")).toBe(100);
    expect(score("CALCULADORA", "Calculadora")).toBe(100);
  });

  it("acha por iniciais", () => {
    expect(score("VSC", "Visual Studio Code")).toBeGreaterThan(0);
    expect(score("gc", "Google Chrome")).toBe(75);
  });

  it("subsequência com 3+ letras", () => {
    expect(score("dscd", "Discord")).toBe(40);
    expect(score("dc", "Discord")).toBe(0);
  });

  it("tolera um erro de digitação", () => {
    expect(score("spotfy", "Spotify")).toBeGreaterThan(0);
    expect(score("disocrd", "Discord")).toBeGreaterThan(0);
    expect(score("chrme", "Google Chrome")).toBeGreaterThan(0);
  });

  it("não combina lixo", () => {
    expect(score("xyz", "Steam")).toBe(0);
    expect(score("", "Steam")).toBe(0);
    expect(score("abc", "Spotify")).toBe(0);
  });
});

describe("calc", () => {
  it("contas básicas", () => {
    expect(calculate("2+2")).toBe(4);
    expect(calculate("250*12")).toBe(3000);
    expect(calculate("10/4")).toBe(2.5);
    expect(calculate("2^10")).toBe(1024);
    expect(calculate("(1+2)*3")).toBe(9);
    expect(calculate("-5+2")).toBe(-3);
    expect(calculate("1,5*2")).toBe(3);
    expect(calculate("50%")).toBe(0.5);
    expect(calculate("3x4")).toBe(12);
    expect(calculate("3 × 4 ÷ 2")).toBe(6);
    expect(calculate("2+3*4")).toBe(14);
    expect(calculate("2^3^2")).toBe(512);
  });

  it("ignora textos que não são contas", () => {
    for (const t of ["2024", "2024 relatório", "1-1-2025", "10/12/2024", "a+b", "spotify", "2+", "(2+3", "3..4+1"]) {
      expect(calculate(t), t).toBeNull();
    }
  });

  it("entradas enormes ou muito aninhadas não quebram", () => {
    expect(calculate("(".repeat(6000) + "1+1")).toBeNull();
    expect(calculate("-".repeat(30000) + "1")).toBeNull();
    expect(calculate("1+".repeat(500) + "1")).toBeNull();
  });

  it("entende separador de milhar pt-BR", () => {
    expect(calculate("1.500*2")).toBe(3000);
    expect(calculate("1.000.000/4")).toBe(250000);
    expect(calculate("1.500,5+0,5")).toBe(1501);
    expect(calculate("2.5*2")).toBe(5);
  });

  it("divisão por zero é null", () => {
    expect(calculate("1/0")).toBeNull();
  });

  it("formata em pt-BR", () => {
    expect(formatNumber(2.5)).toBe("2,5");
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatNumber(1 / 3)).toBe("0,3333333333");
  });
});

describe("web", () => {
  it("yt lofi", () => {
    const m = matchShortcut("yt lofi", shortcuts);
    expect(m?.shortcut.name).toBe("YouTube");
    expect(m?.query).toBe("lofi");
    expect(m?.url).toBe("https://www.youtube.com/results?search_query=lofi");
  });

  it("sem texto não combina", () => {
    expect(matchShortcut("yt", shortcuts)).toBeNull();
    expect(matchShortcut("yt   ", shortcuts)).toBeNull();
    expect(matchShortcut("youtube lofi", shortcuts)).toBeNull();
  });

  it("codifica a pesquisa", () => {
    expect(matchShortcut("G receita & bolo", shortcuts)?.url).toBe(
      "https://www.google.com/search?q=receita%20%26%20bolo",
    );
  });
});

const item = (id: string, name: string) => ({ id, name, kind: "app" as const, target: `C:\\${name}.exe`, args: "", admin: false });

const library: Library = {
  version: 1,
  items: [item("a", "Steam"), item("b", "Steam Deck Tools"), item("app-x", "Spotify")],
  favorites: [],
  categories: [],
  recents: [],
  hidden: ["app-h"],
  launches: { b: 20 },
};
const discovered: Discovered[] = [
  { id: "app-x", name: "Spotify", target: "shell:AppsFolder\\x" },
  { id: "app-h", name: "Spotify Helper", target: "shell:AppsFolder\\h" },
  { id: "app-s", name: "Snipping Tool", target: "shell:AppsFolder\\s" },
];

describe("search", () => {
  const ctx = { library, discovered, shortcuts };

  it("vazio não devolve nada", () => {
    expect(search("   ", ctx)).toEqual([]);
  });

  it("ordem calc, web, itens, comandos", () => {
    expect(search("2*3", ctx)[0]).toMatchObject({ type: "calc", value: 6, text: "6" });
    expect(search("g steam", ctx)[0]).toMatchObject({ type: "web", title: "Pesquisar “steam” no Google" });
    const types = search("s", ctx).map((r) => r.type);
    expect(types.indexOf("item")).toBeLessThan(types.lastIndexOf("command") === -1 ? Infinity : types.lastIndexOf("command"));
  });

  it("mais usado primeiro", () => {
    const names = search("steam", ctx).filter((r) => r.type === "item").map((r) => (r.type === "item" ? r.entry.item.name : ""));
    expect(names[0]).toBe("Steam Deck Tools");
  });

  it("esconde escondidos e não duplica adotados", () => {
    const ids = search("spot", ctx).filter((r) => r.type === "item").map((r) => r.id);
    expect(ids).toEqual(["app-x"]);
  });

  it("acha comando desligar", () => {
    expect(search("deslig", ctx)).toContainEqual(expect.objectContaining({ type: "command", command: "shutdown", label: "Desligar" }));
  });

  it("acha app de Todos", () => {
    expect(search("snip", ctx)[0]).toMatchObject({ type: "item", id: "app-s" });
  });
});

describe("searchVault", () => {
  const entries = [
    { id: "1", name: "Banco", username: "ana", hasPassword: true, hasTotp: false, uri: "https://banco.com" },
    { id: "2", name: "YouTube", username: "ana@x.com", hasPassword: true, hasTotp: false, uri: null },
  ];
  it("senhas só quando há entradas", () => {
    expect(searchVault("banco", [])).toEqual([]);
    expect(searchVault("banco", entries)).toEqual([expect.objectContaining({ type: "password", id: "pw:1" })]);
  });
  it("acha pelo usuário e ignora texto curto", () => {
    expect(searchVault("ana@x", entries).map((r) => r.id)).toEqual(["pw:2"]);
    expect(searchVault("b", entries)).toEqual([]);
  });
});
