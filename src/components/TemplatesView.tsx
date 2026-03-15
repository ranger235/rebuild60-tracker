import React from "react";
import type { LocalWorkoutTemplate, LocalWorkoutTemplateExercise } from "../localdb";

type Props = {
  templates: LocalWorkoutTemplate[];
  openTemplateId: string | null;
  templateExercises: LocalWorkoutTemplateExercise[];

  newTemplateName: string;
  setNewTemplateName: (v: string) => void;
  newTemplateDesc: string;
  setNewTemplateDesc: (v: string) => void;

  createTemplate: () => void;
  openTemplate: (templateId: string) => void;
  deleteTemplate: (templateId: string) => void;

  editTemplateName: string;
  setEditTemplateName: (v: string) => void;
  editTemplateDesc: string;
  setEditTemplateDesc: (v: string) => void;
  saveTemplateMeta: () => void;

  newTemplateExerciseName: string;
  setNewTemplateExerciseName: (v: string) => void;
  addExerciseToTemplate: () => void;
  renameTemplateExercise: (templateExerciseId: string, rawName: string) => void;
  deleteTemplateExercise: (templateExerciseId: string) => void;
  moveTemplateExercise: (templateExerciseId: string, direction: -1 | 1) => void;

  startSessionFromTemplate: () => void;

  displayExerciseName: (name: string) => string;
};

export default function TemplatesView({
  templates,
  openTemplateId,
  templateExercises,
  newTemplateName,
  setNewTemplateName,
  newTemplateDesc,
  setNewTemplateDesc,
  createTemplate,
  openTemplate,
  deleteTemplate,
  editTemplateName,
  setEditTemplateName,
  editTemplateDesc,
  setEditTemplateDesc,
  saveTemplateMeta,
  newTemplateExerciseName,
  setNewTemplateExerciseName,
  addExerciseToTemplate,
  renameTemplateExercise,
  deleteTemplateExercise,
  moveTemplateExercise,
  startSessionFromTemplate,
  displayExerciseName
}: Props) {
  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 10, padding: 12, marginTop: 10 }}>
      <h4 style={{ marginTop: 0 }}>Templates</h4>

      <div style={{ display: "grid", gap: 8 }}>
        <input
          placeholder="New template name (e.g., Lower A)"
          value={newTemplateName}
          onChange={(e) => setNewTemplateName(e.target.value)}
        />
        <input
          placeholder="Description (optional)"
          value={newTemplateDesc}
          onChange={(e) => setNewTemplateDesc(e.target.value)}
        />
        <button onClick={createTemplate}>Create Template</button>
      </div>

      {templates.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {templates.map((t) => (
            <div
              key={t.id}
              style={{
                display: "flex",
                gap: 8,
                alignItems: "stretch"
              }}
            >
              <button
                onClick={() => openTemplate(t.id)}
                style={{
                  flex: 1,
                  textAlign: "left",
                  padding: 10,
                  border: t.id === openTemplateId ? "2px solid black" : "1px solid #ccc",
                  borderRadius: 8
                }}
              >
                <div style={{ fontWeight: 800 }}>{t.name}</div>
                <div style={{ opacity: 0.75, fontSize: 12 }}>{t.description ?? ""}</div>
              </button>

              <button
                onClick={() => deleteTemplate(t.id)}
                title="Delete template"
                style={{
                  width: 46,
                  borderRadius: 8,
                  border: "1px solid #c66",
                  fontWeight: 900
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {openTemplateId && (
        <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Edit template</div>
            <input
              placeholder="Template name"
              value={editTemplateName}
              onChange={(e) => setEditTemplateName(e.target.value)}
            />
            <input
              placeholder="Description (optional)"
              value={editTemplateDesc}
              onChange={(e) => setEditTemplateDesc(e.target.value)}
            />
            <div>
              <button onClick={saveTemplateMeta}>Save Template Details</button>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <input
              placeholder="Add exercise to template"
              value={newTemplateExerciseName}
              onChange={(e) => setNewTemplateExerciseName(e.target.value)}
              style={{ flex: 1 }}
            />
            <button onClick={addExerciseToTemplate}>Add</button>
          </div>

          {templateExercises.length > 0 && (
            <div style={{ marginTop: 2, opacity: 0.95 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8, marginBottom: 8 }}>Template exercises</div>
              <div style={{ display: "grid", gap: 8 }}>
                {templateExercises
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((e, idx, arr) => (
                    <div
                      key={e.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr auto auto auto",
                        gap: 8,
                        alignItems: "center",
                        border: "1px solid #ddd",
                        borderRadius: 8,
                        padding: 8
                      }}
                    >
                      <input
                        value={e.name}
                        onChange={(ev) => renameTemplateExercise(e.id, ev.target.value)}
                      />
                      <button onClick={() => moveTemplateExercise(e.id, -1)} disabled={idx === 0} title="Move up">↑</button>
                      <button onClick={() => moveTemplateExercise(e.id, 1)} disabled={idx === arr.length - 1} title="Move down">↓</button>
                      <button onClick={() => deleteTemplateExercise(e.id)} title="Delete exercise">✕</button>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <button onClick={startSessionFromTemplate} style={{ marginTop: 4 }}>
            Start Session from Template
          </button>
        </div>
      )}
    </div>
  );
}

