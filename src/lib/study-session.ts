export const RECORD_TYPE_LABELS = {
  common_test: "共通テスト演習",
  secondary: "2次演習",
  material: "教材",
} as const;

export type RecordType = keyof typeof RECORD_TYPE_LABELS;

export const RECORD_TYPES = Object.entries(RECORD_TYPE_LABELS) as [
  RecordType,
  string,
][];

export type StudySession = {
  id: string;
  subject_id: string;
  unit_id: string | null;
  material_id: string | null;
  minutes: number;
  study_date: string;
  record_type: RecordType;
  memo: string | null;
  created_at: string;
  subjects?: { name: string; color: string } | null;
  units?: { name: string } | null;
  materials?: { name: string } | null;
};
