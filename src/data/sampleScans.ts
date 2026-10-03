export interface SampleScan {
  id: string;
  title: string;
  year: number;
  volume: string;
  issue: string;
  page: string;
  url: string;
  language: 'fr' | 'ar';
  description: string;
  imageUrl: string;
  rawOcrText: string;
  expectedMetadata: {
    title: string;
    authors: { name: string; wikidataId?: string; affiliation?: string }[];
    date: string;
    volume: string;
    issue: string;
    pageRange: string;
    subjects: { name: string; wikidataId: string }[];
  };
}

export const SAMPLE_SCANS: SampleScan[] = [
  {
    id: 'scan-1954-p23',
    title: "Les hernies de l'hiatus œsophagien",
    year: 1954,
    volume: "32",
    issue: "1",
    page: "23",
    url: "https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/23/mode/2up",
    language: "fr",
    description: "Scan authentique 1954 (Page 23) - Étude clinique et chirurgicale par le Professeur P. Santy de la Faculté de Lyon.",
    imageUrl: "/api/proxy-image?url=https%3A%2F%2Fsearch.archives.nat.tn%2Fuploads%2FLa%2520Tunisie%2520Medicale-1954%2FLaTunisie%2520M%25C3%25A9dicale-Jan-1954-0023.jpg",
    rawOcrText: `LA TUNISIE MÉDICALE — TOME XXXII — N° 1 — JANVIER 1954

LES HERNIES DE L'HIATUS ŒSOPHAGIEN
par P. SANTY
Professeur de clinique chirurgicale à la Faculté de Lyon

Lorsqu'en 1935 CONSTANTINI et MÉNÉGAUX firent leur rapport au Congrès Français de Chirurgie sur les Hernies Diaphragmatiques, ils ne réunissaient que 46 hernies de l'hiatus œsophagien, sur 300 observations.
En 1948, 13 ans plus tard, HARRINGTON apporte 343 cas personnels sur une statistique globale de 430 hernies diaphragmatiques.
Au cours de ces dernières années, de nombreux travaux français et étrangers se sont intéressés à cette manifestation pathologique.`,
    expectedMetadata: {
      title: "Les hernies de l'hiatus œsophagien",
      authors: [
        { name: "P. Santy", affiliation: "Faculté de médecine de Lyon" }
      ],
      date: "1954-01-00",
      volume: "32",
      issue: "1",
      pageRange: "23-44",
      subjects: [
        { name: "Chirurgie", wikidataId: "Q40821" },
        { name: "Hernie hiatale", wikidataId: "Q1140026" }
      ]
    }
  },
  {
    id: 'scan-1954-p47',
    title: "Traitement médical et guérison d'une perforation intestinale au cours d'une fièvre typhoïde traitée par le chloramphénicol",
    year: 1954,
    volume: "32",
    issue: "1",
    page: "47",
    url: "https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/47/mode/2up",
    language: "fr",
    description: "Scan authentique 1954 (Page 47) - Hôpital de la Libération de Tunis, cas clinique de typhoïde par le Dr Raoul Dana et son équipe.",
    imageUrl: "/api/proxy-image?url=https%3A%2F%2Fsearch.archives.nat.tn%2Fuploads%2FLa%2520Tunisie%2520Medicale-1954%2FLaTunisie%2520M%25C3%25A9dicale-Jan-1954-0047.jpg",
    rawOcrText: `SOCIÉTÉ DES SCIENCES MÉDICALES DE TUNISIE
SÉANCE DU VENDREDI 4 DÉCEMBRE 1953

TRAITEMENT MÉDICAL ET GUÉRISON D'UNE PERFORATION INTESTINALE AU COURS D'UNE FIÈVRE TYPHOÏDE TRAITÉE PAR LE CHLORAMPHÉNICOL
par Raoul DANA, Gilbert BORSONI, Jean et Monique THONIER
de l'hôpital de la Libération, Tunis

L'apparition d'une perforation intestinale au cours d'une fièvre typhoïde traitée par le chloramphénicol est une complication dramatique mais heureusement rare.
Nous rapportons le cas d'un jeune homme de 22 ans admis au 14e jour d'une dothiénentérite sévère, chez qui les signes péritonéaux aigus ont régressé sous antibiothérapie intensive combinée.`,
    expectedMetadata: {
      title: "Traitement médical et guérison d'une perforation intestinale au cours d'une fièvre typhoïde traitée par le chloramphénicol",
      authors: [
        { name: "Raoul Dana", affiliation: "Hôpital de la Libération" },
        { name: "Gilbert Borsoni", affiliation: "Hôpital de la Libération" },
        { name: "Jean Thonier", affiliation: "Hôpital de la Libération" },
        { name: "Monique Thonier", affiliation: "Hôpital de la Libération" }
      ],
      date: "1954-01-00",
      volume: "32",
      issue: "1",
      pageRange: "47-52",
      subjects: [
        { name: "Fièvre typhoïde", wikidataId: "Q156740" },
        { name: "Chloramphénicol", wikidataId: "Q223788" }
      ]
    }
  },
  {
    id: 'scan-1954-p53',
    title: "Intérêt de la cholangiographie per-opératoire au cours du traitement de la rupture spontanée des kystes hydatiques du foie dans les voies biliaires",
    year: 1954,
    volume: "32",
    issue: "1",
    page: "53",
    url: "https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/53/mode/2up",
    language: "fr",
    description: "Scan authentique 1954 (Page 53) - Traitement chirurgical de l'échinococcose hépatique à Tunis par les Drs Ganem et Barsotti.",
    imageUrl: "/api/proxy-image?url=https%3A%2F%2Fsearch.archives.nat.tn%2Fuploads%2FLa%2520Tunisie%2520Medicale-1954%2FLaTunisie%2520M%25C3%25A9dicale-Jan-1954-0053.jpg",
    rawOcrText: `CHOLANGIOGRAPHIE ET KYSTES HYDATIQUES DU FOIE

INTÉRÊT DE LA CHOLANGIOGRAPHIE PER-OPÉRATOIRE AU COURS DU TRAITEMENT DE LA RUPTURE SPONTANÉE DES KYSTES HYDATIQUES DU FOIE DANS LES VOIES BILIAIRES
par Roger GANEM et Jacques BARSOTTI
Hôpital de la Libération

Depuis la thèse de BERTHAUT (1883), des polémiques multiples et célèbres ont eu lieu chaque fois qu'il s'est agi de fixer le traitement des kystes hydatiques rompus dans les voies biliaires.
L'exploration radiomanométrique per-opératoire permet aujourd'hui de visualiser précisément l'orifice fistuleux et d'assurer une vacuité cholédocienne complète.`,
    expectedMetadata: {
      title: "Intérêt de la cholangiographie per-opératoire au cours du traitement de la rupture spontanée des kystes hydatiques du foie dans les voies biliaires",
      authors: [
        { name: "Roger Ganem", affiliation: "Hôpital de la Libération" },
        { name: "Jacques Barsotti", affiliation: "Hôpital de la Libération" }
      ],
      date: "1954-01-00",
      volume: "32",
      issue: "1",
      pageRange: "53-58",
      subjects: [
        { name: "Kyste hydatique", wikidataId: "Q207869" },
        { name: "Cholangiographie", wikidataId: "Q2092147" }
      ]
    }
  },
  {
    id: 'scan-1954-p87',
    title: "Les formes familiales de la maladie périodique",
    year: 1954,
    volume: "32",
    issue: "1",
    page: "87",
    url: "https://search.archives.nat.tn/fr/ANTthekira/Lecteur_des_archives/La%20Tunisie%20Medicale-1954#page/87/mode/2up",
    language: "fr",
    description: "Scan authentique 1954 (Page 87) - Étude princeps sur la maladie périodique (fièvre méditerranéenne familiale) en Afrique du Nord.",
    imageUrl: "/api/proxy-image?url=https%3A%2F%2Fsearch.archives.nat.tn%2Fuploads%2FLa%2520Tunisie%2520Medicale-1954%2FLaTunisie%2520M%25C3%25A9dicale-Jan-1954-0087.jpg",
    rawOcrText: `SOCIÉTÉ MÉDICALE DES HÔPITAUX D'ALGER
SÉANCE DU 15 DÉCEMBRE 1953

LES FORMES FAMILIALES DE LA MALADIE PÉRIODIQUE
par MM. Ed. BENHAMOU, A. ALBOU et P. GRIGUER

Les auteurs, après avoir rappelé les observations de Mamou et Catan ainsi que celles de Fred Siguier, rapportent de nouvelles observations de maladie périodique recueillies dans des familles originaires du bassin méditerranéen.
Cette affection se caractérise par des paroxysmes douloureux abdominaux et thoraciques récurrents accompagnés d'hyperthermie brève et d'hyperleucocytose.`,
    expectedMetadata: {
      title: "Les formes familiales de la maladie périodique",
      authors: [
        { name: "Ed. Benhamou" },
        { name: "A. Albou" },
        { name: "P. Griguer" }
      ],
      date: "1954-01-00",
      volume: "32",
      issue: "1",
      pageRange: "87-98",
      subjects: [
        { name: "Fièvre méditerranéenne familiale", wikidataId: "Q843283" }
      ]
    }
  }
];
