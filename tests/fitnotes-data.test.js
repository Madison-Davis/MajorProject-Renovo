const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "fitnotes-data.js"), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const analytics = context.window.fitNotesAnalytics;

function exportFixture() {
  return {
    Data: [{
      Categories: [
        { Id: "chest", Name: "Chest" },
        { Id: "back", Name: "Back" },
      ],
      ExerciseDefinitions: [
        { Id: "press", Name: "Press", CategoryIds: ["chest", "back"] },
        { Id: "row", Name: "Row", CategoryIds: ["back"] },
      ],
      WorkoutInstances: [
        {
          Id: "workout-1",
          Name: "Upper",
          StartTime: "2026-01-05T12:00:00Z",
          SuperSets: [{
            Exercises: [
              { DefinitionId: "press", SetDetails: [
                { Status: 1, Primary: 8, Secondary: 10 },
                { Status: 1, Primary: 8, Secondary: 12 },
                { Status: 2, Primary: 8, Secondary: 99 },
              ] },
              { DefinitionId: "row", SetDetails: [
                { Status: 1, Primary: 10, Secondary: 20 },
              ] },
            ],
          }],
        },
        {
          Id: "workout-2",
          Name: "Upper",
          StartTime: "2026-01-12T12:00:00Z",
          SuperSets: [{
            Exercises: [
              { DefinitionId: "press", SetDetails: [
                { Status: 1, Primary: 8, Secondary: 15 },
              ] },
            ],
          }],
        },
      ],
    }],
  };
}

test("parses completed sets and ignores incomplete sets", () => {
  const parsed = analytics.parseExport(exportFixture());
  assert.equal(parsed.workouts.length, 2);
  assert.equal(parsed.workouts[0].exercises[0].sets.length, 2);
  assert.equal(parsed.workouts[0].exercises[0].sets[1].load, 12);
});

test("merges refreshed workout IDs without duplicating history", () => {
  const first = analytics.parseExport(exportFixture());
  const refreshed = analytics.parseExport({
    Data: [{
      Categories: [{ Id: "chest", Name: "Chest" }, { Id: "back", Name: "Back" }],
      ExerciseDefinitions: [{ Id: "press", Name: "Press", CategoryIds: ["chest", "back"] }],
      WorkoutInstances: [{
        Id: "workout-2",
        Name: "Upper updated",
        StartTime: "2026-01-12T12:00:00Z",
        SuperSets: [{ Exercises: [{ DefinitionId: "press", SetDetails: [{ Status: 1, Primary: 8, Secondary: 16 }] }] }],
      }],
    }],
  });
  const merged = analytics.mergeData(first, refreshed);
  assert.equal(merged.workouts.length, 2);
  assert.equal(merged.workouts.find((workout) => workout.id === "workout-2").name, "Upper updated");
});

test("summarizes load trends and evenly attributes multi-tagged sets", () => {
  const summary = analytics.summarize(analytics.parseExport(exportFixture()));
  const press = summary.exercises.find((exercise) => exercise.id === "press");
  assert.equal(summary.workoutCount, 2);
  assert.equal(summary.totalSets, 4);
  assert.equal(press.points.length, 2);
  assert.equal(press.changePercent, 25);
  assert.equal(summary.muscles.reduce((total, muscle) => total + muscle.share, 0), 100);
});

test("keeps zero-workout weeks in weekly activity", () => {
  const payload = exportFixture();
  payload.Data[0].WorkoutInstances[1].StartTime = "2026-01-26T12:00:00Z";
  const summary = analytics.summarize(analytics.parseExport(payload));
  assert.deepEqual(Array.from(summary.weeklyActivity, (week) => week.workouts), [1, 0, 0, 1]);
});

test("counts an exercise once per workout even if it appears in multiple supersets", () => {
  const payload = exportFixture();
  payload.Data[0].WorkoutInstances[0].SuperSets.push({
    Exercises: [{ DefinitionId: "press", SetDetails: [{ Status: 1, Primary: 8, Secondary: 11 }] }],
  });
  const summary = analytics.summarize(analytics.parseExport(payload));
  assert.equal(summary.exercises.find((exercise) => exercise.id === "press").workoutCount, 2);
});

test("rejects files that are not FitNotes exports", () => {
  assert.throws(() => analytics.parseExport({ Data: [] }), /missing its workout or exercise data/);
});
