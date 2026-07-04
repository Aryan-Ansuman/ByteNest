import { SMELL_CATALOG, type SmellDefinition, type SmellId } from "./catalog";
import type { RuleFunction } from "./rules/agnostic-rules";
import {
  n1Query, missingErrorHandling, blockingMainThread, deepNesting, godFunction,
  debugCodeLeft, magicNumbers, sqlInLoop, selectStar,
} from "./rules/agnostic-rules";
import {
  memoryLeakRisk, promiseNotAwaited, implicitAny, synchronousLoopInAsync,
} from "./rules/js-ts-rules";
import {
  bareExcept, mutableDefaultArgument, globalStateMutation, stringConcatenationInLoop,
} from "./rules/python-rules";

export type RuleRegistryEntry = SmellDefinition & { rule: RuleFunction };

// One entry per catalog id. Adding a new smell: add its definition to
// SMELL_CATALOG in catalog.ts, write a rule function, add it here — no
// other file changes.
const RULE_FUNCTIONS: Record<SmellId, RuleFunction> = {
  "n+1-query": n1Query,
  "missing-error-handling": missingErrorHandling,
  "blocking-main-thread": blockingMainThread,
  "deep-nesting": deepNesting,
  "god-function": godFunction,
  "debug-code-left": debugCodeLeft,
  "magic-numbers": magicNumbers,
  "sql-in-loop": sqlInLoop,
  "select-star": selectStar,
  "memory-leak-risk": memoryLeakRisk,
  "promise-not-awaited": promiseNotAwaited,
  "implicit-any": implicitAny,
  "synchronous-loop-in-async": synchronousLoopInAsync,
  "bare-except": bareExcept,
  "mutable-default-argument": mutableDefaultArgument,
  "global-state-mutation": globalStateMutation,
  "string-concatenation-in-loop": stringConcatenationInLoop,
};

export const SMELL_RULE_REGISTRY: RuleRegistryEntry[] = SMELL_CATALOG.map((definition) => {
  const rule = RULE_FUNCTIONS[definition.id as SmellId];
  if (!rule) {
    // Fail fast at module load, not at first analysis — a catalog entry
    // with no rule is a build-time mistake, not a runtime one.
    throw new Error(`No rule function registered for smell "${definition.id}" — add one in registry.ts`);
  }
  return { ...definition, rule };
});
