/**
 * TTS read marks, anchored by ParaId (owner: WS-C). Backs `book:readMarks:get/set`.
 * Replaces the index-keyed `ttsReadMarks:{path}` setting at the Phase 2c cutover.
 */

import type { SqlDb } from "../db/sql";
import type { ChapterId, ParaId } from "../shared/pipeline/types";

export function getReadMarks(db: SqlDb, filePath: string): Record<ChapterId, ParaId> {
  const out: Record<ChapterId, ParaId> = {};
  for (const r of db.all<{ chapter_id: string; para_id: string }>(
    "SELECT chapter_id, para_id FROM read_marks WHERE file_path = ?",
    [filePath],
  )) {
    out[r.chapter_id] = r.para_id;
  }
  return out;
}

export function setReadMark(db: SqlDb, filePath: string, chapterId: ChapterId, paraId: ParaId): void {
  if (!filePath || !chapterId || !paraId) throw new Error("setReadMark: filePath, chapterId and paraId are required");
  db.run(
    "INSERT INTO read_marks (file_path, chapter_id, para_id) VALUES (?, ?, ?) " +
      "ON CONFLICT (file_path, chapter_id) DO UPDATE SET para_id = excluded.para_id",
    [filePath, chapterId, paraId],
  );
}
