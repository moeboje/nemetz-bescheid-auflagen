export type Authority = {
  id: string;
  name: string;
  shortName?: string;
  isArchived: boolean;
};

export type AuthorityContact = {
  id: string;
  authorityId: string;
  name: string;
  email?: string;
  phone?: string;
  roleTitle?: string;
  isArchived: boolean;
};

export const authorities: Authority[] = [
  {
    id: "auth-001",
    name: "Landesregierung Steiermark",
    shortName: "LR-STMK",
    isArchived: false
  },
  {
    id: "auth-002",
    name: "Bezirkshauptmannschaft Linz-Land",
    shortName: "BHL-LZ",
    isArchived: false
  }
];

export const contacts: AuthorityContact[] = [
  {
    id: "contact-001",
    authorityId: "auth-001",
    name: "Anna Berger",
    email: "anna.berger@stmk.gv.at",
    phone: "+43 316 123456",
    roleTitle: "Sachbearbeitung Umwelt",
    isArchived: false
  },
  {
    id: "contact-002",
    authorityId: "auth-001",
    name: "Martin Hofer",
    email: "martin.hofer@stmk.gv.at",
    phone: "+43 316 123789",
    roleTitle: "Teamleitung Anlagen",
    isArchived: false
  },
  {
    id: "contact-003",
    authorityId: "auth-002",
    name: "Lena Winter",
    email: "lena.winter@ooe.gv.at",
    phone: "+43 732 778899",
    roleTitle: "Sachbearbeitung Abfall",
    isArchived: false
  },
  {
    id: "contact-004",
    authorityId: "auth-002",
    name: "Peter Lang",
    email: "peter.lang@ooe.gv.at",
    phone: "+43 732 445566",
    roleTitle: "Leitung Umweltverfahren",
    isArchived: false
  }
];
