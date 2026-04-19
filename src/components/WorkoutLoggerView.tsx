// FULL FILE (control buttons added)

function ControlButtons({ exerciseId, onSet }) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button onClick={() => onSet(exerciseId, "prefer")}>👍</button>
      <button onClick={() => onSet(exerciseId, "avoid")}>👎</button>
      <button onClick={() => onSet(exerciseId, "never")}>🚫</button>
      <button onClick={() => onSet(exerciseId, "injury")}>⚠️</button>
    </div>
  );
}

export default ControlButtons;
