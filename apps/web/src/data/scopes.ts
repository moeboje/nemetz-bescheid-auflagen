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
    name: "Nemetz Group",
    sites: [
      {
        id: "s-001",
        name: "Graz",
        projects: 5,
        documents: 18,
        openTasks: 6,
        overdue: 1,
        facilities: [
          {
            id: "f-001",
            name: "Linie 3",
            projects: 2,
            documents: 6,
            openTasks: 3,
            overdue: 1
          },
          {
            id: "f-002",
            name: "Logistikhof",
            projects: 1,
            documents: 3,
            openTasks: 1,
            overdue: 0
          }
        ]
      },
      {
        id: "s-002",
        name: "Linz",
        projects: 3,
        documents: 11,
        openTasks: 4,
        overdue: 1,
        facilities: [
          {
            id: "f-003",
            name: "Recyclinghof",
            projects: 2,
            documents: 7,
            openTasks: 2,
            overdue: 1
          },
          {
            id: "f-004",
            name: "Materiallager",
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
    name: "Nemetz Energy",
    sites: [
      {
        id: "s-003",
        name: "Salzburg",
        projects: 4,
        documents: 13,
        openTasks: 5,
        overdue: 2,
        facilities: [
          {
            id: "f-005",
            name: "Tanklager",
            projects: 3,
            documents: 9,
            openTasks: 4,
            overdue: 2
          },
          {
            id: "f-006",
            name: "Kesselhaus",
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
