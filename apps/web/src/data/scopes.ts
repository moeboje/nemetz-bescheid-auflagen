export type FacilityScope = {
  id: string;
  name: string;
  projects: number;
  documents: number;
  openTasks: number;
  overdue: number;
};

export type SiteScope = {
  id: string;
  name: string;
  projects: number;
  documents: number;
  openTasks: number;
  overdue: number;
  facilities: FacilityScope[];
};

export type CompanyScope = {
  id: string;
  name: string;
  sites: SiteScope[];
};

export const scopes: CompanyScope[] = [
  {
    id: "c-001",
    name: "Nemetz AG",
    sites: [
      {
        id: "s-001",
        name: "Wien 1150",
        projects: 5,
        documents: 18,
        openTasks: 6,
        overdue: 1,
        facilities: []
      },
      {
        id: "s-002",
        name: "Leopoldsdorf",
        projects: 3,
        documents: 11,
        openTasks: 4,
        overdue: 1,
        facilities: [
          {
            id: "f-001",
            name: "Sortieranlage Leopoldsdorf",
            projects: 2,
            documents: 7,
            openTasks: 2,
            overdue: 1
          },
          {
            id: "f-002",
            name: "Umladestation",
            projects: 1,
            documents: 4,
            openTasks: 2,
            overdue: 0
          }
        ]
      }
    ]
  },
  {
    id: "c-002",
    name: "Nemetz Muehlendorf GmbH",
    sites: [
      {
        id: "s-003",
        name: "Muehlendorf",
        projects: 4,
        documents: 13,
        openTasks: 5,
        overdue: 2,
        facilities: [
          {
            id: "f-005",
            name: "Zwischenlager",
            projects: 3,
            documents: 9,
            openTasks: 4,
            overdue: 2
          },
          {
            id: "f-006",
            name: "Containerplatz",
            projects: 1,
            documents: 4,
            openTasks: 1,
            overdue: 0
          }
        ]
      }
    ]
  }
];
