export interface DagTask {
  id: string;
  dependencies: string[];
}

export interface DagPlan {
  order: string[];
  parallelWaves: string[][];
}

export class DagScheduler {
  plan<T extends DagTask>(tasks: readonly T[]): DagPlan {
    const byId = new Map<string, T>();
    for (const task of tasks) {
      if (!task.id) throw new Error('Görev ID boş olamaz.');
      if (byId.has(task.id)) throw new Error(`Yinelenen görev ID: ${task.id}`);
      byId.set(task.id, task);
    }

    const degree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const task of tasks) {
      const uniqueDependencies = new Set(task.dependencies ?? []);
      for (const dep of uniqueDependencies) {
        if (!byId.has(dep)) throw new Error(`Görev "${task.id}" bulunmayan bağımlılığa sahip: "${dep}"`);
        if (dep === task.id) throw new Error(`Döngüsel bağımlılık tespit edildi: ${task.id} -> ${task.id}`);
        const list = dependents.get(dep) ?? [];
        list.push(task.id);
        dependents.set(dep, list);
      }
      degree.set(task.id, uniqueDependencies.size);
    }

    let ready = tasks.filter((task) => degree.get(task.id) === 0).map((task) => task.id);
    const waves: string[][] = [];
    const order: string[] = [];
    while (ready.length) {
      const wave = ready;
      waves.push(wave);
      order.push(...wave);
      const next: string[] = [];
      for (const id of wave) {
        for (const child of dependents.get(id) ?? []) {
          const remaining = degree.get(child)! - 1;
          degree.set(child, remaining);
          if (remaining === 0) next.push(child);
        }
      }
      ready = next;
    }

    if (order.length !== tasks.length) {
      const cyclic = tasks.filter((task) => degree.get(task.id)! > 0).map((task) => task.id);
      throw new Error(`Döngüsel bağımlılık tespit edildi: ${cyclic.join(', ')}`);
    }
    return { order, parallelWaves: waves };
  }

  topologicalSort<T extends DagTask>(tasks: readonly T[]): string[] {
    return this.plan(tasks).order;
  }
}

export const dagScheduler = new DagScheduler();
