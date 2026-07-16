export type EducationSummaryMetrics = {
  districts: number;
  policy_documents: number;
  latest_year: number;
  current_verified_documents: number;
  complete_district_stage: number;
  sourced_district_stage: number;
  rules: number;
  timelines: number;
  rule_types: number;
  schools: number;
  primary_records: number;
  junior_records: number;
  school_districts: number;
  with_address: number;
  with_website: number;
};

export type EducationCitySummary = {
  code: string;
  name: string;
  officialName: string;
  provinceCode: string;
  metrics: EducationSummaryMetrics;
};

export type EducationSummary = {
  title: string;
  release: string;
  schemaVersion: number;
  asOfDate: string;
  exportedAt: string;
  validationGeneratedAt: string;
  validated: boolean;
  tests: { passed: number; total: number } | null;
  metrics: {
    cities: number;
    districts: number;
    policyDocuments: number;
    policyRules: number;
    timelineEvents: number;
    operationalCityStageCoverage: number;
    strictCurrentCityStageCoverage: number;
    expectedCityStageCoverage: number;
    completeDistrictStageCoverage: number;
    districtStageSourceCoverage: number;
    expectedDistrictStageCoverage: number;
    schools: number;
    schoolCityStageCoverage: number;
    aliases: number;
    claims: number;
    schoolDistrictStageCoverage: number;
  };
  warnings: string[];
  sourceFiles: string[];
  nullSemantics: string;
  cities: EducationCitySummary[];
};

export type EducationPolicy = {
  id: number;
  districtCode: string | null;
  districtName: string;
  managementArea: string | null;
  coverageScope: string;
  scopeCompleteness: string;
  sourceStatus: string;
  stage: "primary" | "junior" | "both";
  stageLabel: string;
  admissionYear: number;
  title: string;
  issuingAuthority: string;
  documentNumber: string | null;
  publishedDate: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
  verificationStatus: string;
  notes: string | null;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublisher: string | null;
  sourceType: string;
  authorityLevel: number;
  sourceVerificationStatus: string;
  ruleCount: number;
  timelineCount: number;
};

export type EducationRule = {
  id: number;
  policyId: number;
  districtCode: string | null;
  districtName: string;
  stage: "primary" | "junior" | "both";
  stageLabel: string;
  ruleType: string;
  subjectGroup: string;
  ruleText: string;
  evidenceText: string | null;
  sourceLocator: string;
  isInferred: number;
  confidence: number;
  admissionYear: number;
  policyTitle: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type EducationTimeline = {
  id: number;
  policyId: number;
  districtCode: string | null;
  districtName: string;
  stage: "primary" | "junior" | "both";
  stageLabel: string;
  eventType: string;
  eventName: string;
  startsAt: string | null;
  endsAt: string | null;
  evidenceText: string;
  sourceLocator: string;
  isInferred: number;
  admissionYear: number;
  policyTitle: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type EducationSchool = {
  id: number;
  districtCode: string;
  districtName: string;
  managementArea: string | null;
  name: string;
  schoolLevel: string;
  hasPrimary: number;
  hasJunior: number;
  status: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  officialSchoolCode: string | null;
  establishedDate: string | null;
  publicStatusEvidence: string;
  verifiedAt: string;
  sourceTitle: string;
  sourceUrl: string;
  sourcePublisher: string | null;
  authorityLevel: number;
  overview: string | null;
  facultyStrength: string | null;
  parentReputation: string | null;
  featuredTeaching: string | null;
  progressionOutcomes: string | null;
  awards: string | null;
  aliases: string | null;
};

export type EducationDistrict = {
  code: string;
  name: string;
  officialName: string;
  policyDocuments: number;
  rules: number;
  timelines: number;
  schools: number;
  primary: number;
  junior: number;
};

export type EducationCityData = {
  schemaVersion: number;
  exportedAt: string;
  city: EducationCitySummary;
  districts: EducationDistrict[];
  policies: EducationPolicy[];
  rules: EducationRule[];
  timelines: EducationTimeline[];
  schools: EducationSchool[];
};
