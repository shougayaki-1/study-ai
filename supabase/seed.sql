-- study-ai 初期データ(科目13 + 単元マスタ)
-- schema.sql 実行後に実行する。既存データがあれば一旦削除してから投入する(冪等)。

delete from units;
delete from subjects;

-- ============================================================
-- 科目マスタ(色はMUIパレットに調和するhex)
-- ============================================================
insert into subjects (name, color, sort_order) values
  ('英語R',   '#3f51b5', 1),  -- indigo
  ('英語L',   '#5c6bc0', 2),  -- indigo light
  ('現代文',  '#e53935', 3),  -- red
  ('古文',    '#ef5350', 4),  -- red light
  ('漢文',    '#ff7043', 5),  -- deep orange
  ('数学IA',  '#1e88e5', 6),  -- blue
  ('数学2BC', '#42a5f5', 7),  -- blue light
  ('化学基礎', '#00897b', 8),  -- teal
  ('地学基礎', '#26a69a', 9),  -- teal light
  ('地理',    '#7cb342', 10), -- light green
  ('政治経済', '#fb8c00', 11), -- orange
  ('情報',    '#8e24aa', 12), -- purple
  ('小論文',  '#546e7a', 13); -- blue grey

-- ============================================================
-- 単元マスタ
-- 英数国: 詳細単元 / 理社情報: 大分類5〜8区分
-- ============================================================

-- 英語R
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('文法・語彙', 1),
  ('読解(論説文)', 2),
  ('読解(物語文)', 3),
  ('長文読解(共通テスト形式)', 4),
  ('英作文', 5)
) as u(name, sort_order) where subjects.name = '英語R';

-- 英語L
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('音声認識・聞き取り', 1),
  ('対話文聴解', 2),
  ('モノローグ聴解', 3),
  ('図表・資料問題', 4)
) as u(name, sort_order) where subjects.name = '英語L';

-- 現代文
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('評論文読解', 1),
  ('小説読解', 2),
  ('語彙・漢字', 3),
  ('記述問題', 4),
  ('表現技法', 5)
) as u(name, sort_order) where subjects.name = '現代文';

-- 古文
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('古文単語', 1),
  ('文法(助動詞)', 2),
  ('文法(助詞)', 3),
  ('敬語', 4),
  ('読解(物語)', 5),
  ('読解(随筆)', 6)
) as u(name, sort_order) where subjects.name = '古文';

-- 漢文
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('句形', 1),
  ('語彙', 2),
  ('読解', 3),
  ('返り点・書き下し', 4)
) as u(name, sort_order) where subjects.name = '漢文';

-- 数学IA
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('数と式', 1),
  ('二次関数', 2),
  ('図形と計量', 3),
  ('場合の数', 4),
  ('確率', 5),
  ('整数の性質', 6),
  ('図形の性質', 7),
  ('データの分析', 8)
) as u(name, sort_order) where subjects.name = '数学IA';

-- 数学2BC
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('式と証明', 1),
  ('複素数と方程式', 2),
  ('図形と方程式', 3),
  ('三角関数', 4),
  ('指数関数・対数関数', 5),
  ('微分', 6),
  ('積分', 7),
  ('数列', 8),
  ('統計的な推測', 9),
  ('ベクトル', 10)
) as u(name, sort_order) where subjects.name = '数学2BC';

-- 化学基礎(大分類5区分)
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('物質の構成', 1),
  ('物質の変化', 2),
  ('化学反応', 3),
  ('酸と塩基', 4),
  ('酸化還元', 5)
) as u(name, sort_order) where subjects.name = '化学基礎';

-- 地学基礎(大分類区分)
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('地球の姿', 1),
  ('大気と海洋', 2),
  ('地球の歴史', 3),
  ('宇宙の構成', 4)
) as u(name, sort_order) where subjects.name = '地学基礎';

-- 地理(大分類6区分)
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('自然環境', 1),
  ('資源と産業', 2),
  ('人口と都市', 3),
  ('生活文化と宗教', 4),
  ('地誌(現代世界の地域区分)', 5),
  ('地図と地理情報', 6)
) as u(name, sort_order) where subjects.name = '地理';

-- 政治経済(大分類6区分)
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('政治(民主政治の基本原理)', 1),
  ('政治(日本の政治制度)', 2),
  ('経済(市場と経済主体)', 3),
  ('経済(国民経済と国際経済)', 4),
  ('国際政治', 5),
  ('国際経済', 6)
) as u(name, sort_order) where subjects.name = '政治経済';

-- 情報(大分類4区分)
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('情報社会と情報モラル', 1),
  ('コミュニケーションと情報デザイン', 2),
  ('コンピュータとプログラミング', 3),
  ('情報通信ネットワークとデータ活用', 4)
) as u(name, sort_order) where subjects.name = '情報';

-- 小論文(観点別)
insert into units (subject_id, name, sort_order)
select id, u.name, u.sort_order from subjects, (values
  ('構成力', 1),
  ('論理展開', 2),
  ('語彙・表現', 3),
  ('テーマ理解・知識', 4)
) as u(name, sort_order) where subjects.name = '小論文';
