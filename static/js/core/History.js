export class History {
  constructor(initialState = []) { this.states = [JSON.stringify(initialState)]; this.index = 0; }

  record(entities) {
    const serialized = JSON.stringify(entities.map((entity) => entity.serialize()));
    if (serialized === this.states[this.index]) return;
    this.states = this.states.slice(0, this.index + 1);
    this.states.push(serialized);
    this.index = this.states.length - 1;
  }

  undo() { if (this.index === 0) return null; this.index -= 1; return JSON.parse(this.states[this.index]); }
  redo() { if (this.index >= this.states.length - 1) return null; this.index += 1; return JSON.parse(this.states[this.index]); }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.states.length - 1; }
}