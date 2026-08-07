-- Enough of a corpus to see the interface work, and one account to see the
-- signed-in half of it. Local only: `demo-token` is a fixture, and the hash
-- below is its SHA-256 — the same thing the accounts service computes from a
-- presented bearer token.
DELETE FROM canonical_jobs;
DELETE FROM principals;
DELETE FROM profiles;

INSERT INTO canonical_jobs (id, canonicalKey, title, titleNormalized, employerName, employerNameNormalized, location, locationNormalized, description, applicationUrl, publishedAt, deadline, statusTag, statusClosedAt, sequence, changedAt, sources) VALUES
 ('cj_1','k1','Baker i Østfold','baker i østfold','Bakeriet AS','bakeriet as','Østfold','østfold','Vi søker en baker til vårt bakeri. Tidlige morgener, godt arbeidsmiljø.','https://example.com/job/1','2026-08-01T06:00:00Z',NULL,'Active',NULL,1,'2026-08-01T06:00:00Z','["nav"]'),
 ('cj_2','k2','Frontendutvikler','frontendutvikler','Nordic Tech AS','nordic tech as','Oslo','oslo','TypeScript, React og litt Rust. Hybrid arbeidssted i Oslo sentrum.','https://example.com/job/2','2026-08-02T08:00:00Z','2026-09-01','Active',NULL,2,'2026-08-02T08:00:00Z','["nav"]'),
 ('cj_3','k3','Sykepleier natt','sykepleier natt','Bergen Kommune','bergen kommune','Bergen','bergen','Nattevakt ved sykehjem. Turnus, gode pensjonsordninger.','https://example.com/job/3','2026-08-03T09:30:00Z',NULL,'Active',NULL,3,'2026-08-03T09:30:00Z','["nav"]'),
 ('cj_4','k4','Lærer i matematikk','lærer i matematikk','Trondheim Skole','trondheim skole','Trondheim','trondheim','Undervisning på ungdomstrinnet fra august.','https://example.com/job/4','2026-07-28T10:00:00Z',NULL,'Closed','2026-08-04T10:00:00Z',4,'2026-08-04T10:00:00Z','["nav"]');

INSERT INTO profiles (profileId, cv, erasure, createdAt, updatedAt) VALUES
 ('profile-demo','{"headline":"Frontend engineer","summary":"Eight years building interfaces, most recently in TypeScript.","location":"Oslo","languages":"Norwegian, English","skills":["TypeScript","Effect","SQL"],"experience":[{"title":"Senior engineer","employer":"Nordic Tech AS","period":"2021–2026","highlights":["Led the design-system rewrite"]}],"education":["BSc Informatics, UiO"]}','{"_tag":"Active"}','2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');

INSERT INTO principals (principalId, profileId, apiKeyHash, revokedAt, createdAt, updatedAt) VALUES
 ('principal-demo','profile-demo','7c43ef5ae21d43ce2743f770c68e24def1a43ee2f416d2438410c8af7af2ff2c',NULL,'2026-08-01T00:00:00Z','2026-08-01T00:00:00Z');
