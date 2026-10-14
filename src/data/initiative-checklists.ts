export interface ChecklistSection {
  title: string;
  description?: string;
  limit?: string;
  items: (string | { label: string; key: string })[];
}

export interface NoteField {
  type?: 'text';
  key?: string;
  label: string;
  prompt?: string;
  lines?: number;
}

export interface ListColumn {
  key: string;
  label: string;
  kind?: 'text' | 'tags';
  collapsed?: boolean;
  /** Rendered below the name/roles row, full width (Steckbrief). */
  fullRow?: boolean;
  /**
   * Commit behaviour: typing commits on Enter/blur into stable text (with
   * pencil affordance to re-edit). For `tags` the committed value renders
   * as pills, or as a bullet list when `bullets` is set (skills).
   */
  commit?: boolean;
  /** Render committed tags as a bullet list instead of pills. */
  bullets?: boolean;
  suggestions?: string[];
  placeholder?: string;
}

export interface ListField {
  type: 'list';
  key: string;
  label: string;
  prompt?: string;
  icon?: string;
  initialRows?: number;
  addLabel?: string;
  columns: ListColumn[];
}

export interface InitiativeChecklistDefinition {
  id: string;
  chapter: number;
  title: string;
  intro?: string;
  sections: ChecklistSection[];
  noteFields?: (NoteField | ListField)[];
}

export const initiativeRoles = [
  'Recherche',
  'Nachbarschaftskontakt',
  'Social Media',
  'Bezirkskontakte',
  'Aktionen',
  'Koordination',
];

export const deChapterChecklists = [
  {
    id: 'de-arbeitsimpuls-start',
    chapter: 1,
    title: 'Checkliste: Initiative festhalten',
    intro: 'Beginnt mit einem gemeinsamen Namen und einem aktuellen Stand. Diese Angaben erscheinen später im Steckbrief.',
    sections: [],
    noteFields: [
      { key: 'initiative-title', label: 'Titel der Initiative', prompt: 'Wie nennt ihr euer Anliegen nach außen?', lines: 1 },
      {
        type: 'list',
        key: 'initiative-active',
        label: 'Aktive',
        prompt: 'Welche Namen und eventuell Fähigkeiten oder Erfahrungen bringt ihr aktuell mit? Rollen werden später verteilt.',
        icon: 'person',
        initialRows: 3,
        addLabel: 'Weitere Person hinzufügen',
        columns: [
          { key: 'name', label: 'Name', commit: true, placeholder: 'Name eintippen …' },
          { key: 'skills', label: 'Fähigkeiten', kind: 'tags', commit: true, bullets: true, placeholder: 'Fähigkeit eintippen …' },
        ],
      },
    ],
  },
  {
    id: 'de-arbeitsimpuls-kontext',
    chapter: 2,
    title: 'Checkliste: Anliegen und Gebiet klären',
    intro: 'Klären, wo ihr ansetzt, wer welche Rolle übernimmt und welches Ziel euch verbindet.',
    sections: [],
    noteFields: [
      { key: 'initiative-area', label: 'Gebiet abgrenzen', prompt: 'Welches Grätzl oder welcher Ort steht im Zentrum?', lines: 2 },
      {
        type: 'list',
        key: 'initiative-active',
        label: 'Kernteam bilden',
        prompt: 'Personen aus Kapitel 1 werden übernommen; Fähigkeiten stehen als Steckbrief unter Name und Rollen. Rollen werden als Stichworte ergänzt.',
        icon: 'person',
        initialRows: 3,
        addLabel: 'Weitere Person hinzufügen',
        columns: [
          { key: 'name', label: 'Name', commit: true, placeholder: 'Name eintippen …' },
          { key: 'roles', label: 'Rollen', kind: 'tags', commit: true, suggestions: initiativeRoles, placeholder: 'Rolle eintippen …' },
          { key: 'skills', label: 'Fähigkeiten', kind: 'tags', commit: true, bullets: true, fullRow: true, placeholder: 'Fähigkeit eintippen …' },
        ],
      },
      { key: 'initiative-purpose', label: 'Ziel einfach formulieren', prompt: 'Zum Beispiel: kein Durchzugsverkehr rund um die Schule; sichere Wege und mehr Aufenthalt im Grätzl.', lines: 3 },
    ],
  },
  {
    id: 'de-arbeitsimpuls-loesung',
    chapter: 3,
    title: 'Checkliste: Lösung sichtbar machen',
    intro: 'Haltet fest, welche räumliche Veränderung eure Initiative vorschlägt und wie ihr sie testbar macht.',
    sections: [],
    noteFields: [
      { key: 'initiative-solution', label: 'Plausible räumliche Lösung', prompt: 'Welche Veränderung im Raum macht euer Anliegen konkret?', lines: 4 },
      { key: 'initiative-first-action', label: 'Erste sichtbare Aktion', prompt: 'Welche Intervention, Skizze oder Aktivität zeigt diese Lösung?', lines: 4 },
    ],
  },
  {
    id: 'de-arbeitsimpuls-narrativ',
    chapter: 4,
    title: 'Checkliste: Verbündete und Narrativ',
    intro: 'Sammelt, wer mit euch Macht aufbauen kann und wie ihr die Veränderung erzählt.',
    sections: [],
    noteFields: [
      { key: 'initiative-established-allies', label: 'Bereits etablierte Verbindungen', lines: 3 },
      { key: 'initiative-potential-allies', label: 'Potenzielle Verbündete', prompt: 'Wer ist noch betroffen oder könnte profitieren?', lines: 3 },
      { key: 'initiative-narrative', label: 'Narrativ in fünf Sätzen', prompt: 'Wofür, warum jetzt, mit wem, gegen welches Problem, mit welchem Ziel?', lines: 5 },
    ],
  },
  {
    id: 'de-arbeitsimpuls-politik',
    chapter: 4,
    title: 'Checkliste: Entscheidungsebenen einschätzen',
    intro: 'Sortiert die politischen Ebenen, bevor ihr konkrete Gespräche plant.',
    sections: [],
    noteFields: [
      { key: 'initiative-current-debate', label: 'Was zuletzt geschah', prompt: 'Wie verhält sich das Anliegen zur aktuellen Debatte?', lines: 4 },
      { key: 'initiative-decision-level', label: 'Wichtigste Entscheidungsebene', prompt: 'Macht, Synergien, Beziehung, Priorität', lines: 6 },
      { key: 'initiative-opposition', label: 'Potenzielle Gegenstimmen', prompt: 'Wer, Standpunkte, Relevanz', lines: 5 },
    ],
  },
  {
    id: 'de-arbeitsimpuls-belege',
    chapter: 5,
    title: 'Checkliste: Belege planen',
    intro: 'Entscheidet, welche Belege eure Forderung stärker machen und wer sie sammelt.',
    sections: [],
    noteFields: [
      { key: 'initiative-evidence', label: 'Wichtigste Belege', prompt: 'Welche Beobachtungen, Zahlen, Fotos oder Stimmen braucht ihr?', lines: 4 },
      { key: 'initiative-monitoring', label: 'Monitoring-Methode', prompt: 'Ort, Zeitpunkt, Methode, Verantwortliche', lines: 4 },
    ],
  },
  {
    id: 'de-arbeitsimpuls-naechste-schritte',
    chapter: 6,
    title: 'Checkliste: Nächste Schritte priorisieren',
    intro: 'Wählt nur aus, was als nächstes wirklich relevant ist, und übersetzt es in Aufgaben.',
    sections: [
      {
        title: 'Aktuelle Schwerpunkte',
        limit: 'Empfehlung: markiert zwei Schwerpunkte für die nächste Arbeitsphase.',
        items: [
          { key: 'focus-allies', label: 'Umfeld an Verbündeten erweitern' },
          { key: 'focus-evidence', label: 'Mehr Belege bzw. Hintergrundwissen zum Anliegen sammeln' },
          { key: 'focus-attention', label: 'Mehr Aufmerksamkeit für die Initiative erzeugen' },
          { key: 'focus-growth', label: 'Initiative selbst vergrößern' },
          { key: 'focus-decision-makers', label: 'Ziele mit Entscheidungsträger:innen diskutieren' },
        ],
      },
      {
        title: 'Mögliche nächste Handlungsoptionen',
        limit: 'Markiert drei bis fünf Optionen, die jetzt zum Ziel passen.',
        items: [
          { key: 'option-direct-contact', label: 'Direkte Kontaktaufnahme mit potenziellen Verbündeten planen' },
          { key: 'option-workshop', label: 'Zu Diskussion oder Aktivität einladen, zum Beispiel Street Design Workshop' },
          { key: 'option-door', label: 'Haustürgespräche vorbereiten' },
          { key: 'option-petition', label: 'Petition via Stadt Wien Portal oder aufstehn.at prüfen' },
          { key: 'option-background-talks', label: 'Hintergrundgespräche mit Personen in relevanten Positionen führen' },
          { key: 'option-learn-network', label: 'Von anderen Initiativen im Wir machen Wien-Netzwerk lernen' },
          { key: 'option-traffic-count', label: 'Verkehrszählung durchführen' },
          { key: 'option-info-request', label: 'Amtliche Informationen anfragen' },
          { key: 'option-planning', label: 'In aktuelle Planung Einblick nehmen' },
          { key: 'option-press', label: 'Pressearbeit vorbereiten' },
          { key: 'option-social', label: 'Social-Media-Beiträge oder Reel planen' },
          { key: 'option-online', label: 'Onlinepräsenz aktualisieren' },
          { key: 'option-action', label: 'Aktion vor Ort planen' },
          { key: 'option-local-ads', label: 'Werbung vor Ort vorbereiten' },
          { key: 'option-recruit', label: 'Mehr Personen anwerben' },
          { key: 'option-structure', label: 'Gruppenstruktur aufbauen' },
          { key: 'option-association', label: 'Vereinsgründung prüfen' },
          { key: 'option-budget', label: 'Budget oder Förderungen organisieren' },
          { key: 'option-present', label: 'Belege und Verbündete präsentieren' },
          { key: 'option-negotiation', label: 'Antworten auf erwartbare Argumente und mögliche Kompromisse vorbereiten' },
        ],
      },
    ],
    noteFields: [
      { key: 'initiative-next-steps', label: 'Aufgabenplan', prompt: 'Was, wer, wann, warum und bis wann?', lines: 6 },
    ],
  },
] satisfies InitiativeChecklistDefinition[];

export const initiativeChecklists = {
  de: deChapterChecklists,
};

export type InitiativeChecklistKey = (typeof deChapterChecklists)[number]['id'];

export function getInitiativeChecklist(id: InitiativeChecklistKey): InitiativeChecklistDefinition {
  const checklist = deChapterChecklists.find((item) => item.id === id);
  if (!checklist) throw new Error(`Unknown initiative checklist: ${id}`);
  return checklist;
}
