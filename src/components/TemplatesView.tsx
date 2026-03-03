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

  newTemplateExerciseName: string;
  setNewTemplateExerciseName: (v: string) => void;
  addExerciseToTemplate: () => void;

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
  newTemplateExerciseName,
  setNewTemplateExerciseName,
  addExerciseToTemplate,
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
        <div style={{ marginTop: 12 }}>
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
            <div style={{ marginTop: 10, opacity: 0.9 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.8 }}>Template exercises</div>
              <ol>
                {templateExercises
                  .slice()
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((e) => (
                    <li key={e.id}>{displayExerciseName(e.name)}</li>
                  ))}
              </ol>
            </div>
          )}

          <button onClick={startSessionFromTemplate} style={{ marginTop: 10 }}>
            Start Session from Template
          </button>
        </div>
      )}
    </div>
  );
}
