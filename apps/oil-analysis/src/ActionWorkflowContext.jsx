import { createContext, useContext } from "react";

// Phase 2 — the action closure steps (request / approve / reject / close),
// provided by App.jsx so the action editor can run them from any page that
// opens it (Action Tracker, Equipment, Last Actions) and the shared action
// list updates in one place.
const ActionWorkflowContext = createContext(null);

export const ActionWorkflowProvider = ActionWorkflowContext.Provider;

export function useActionWorkflow() {
  return useContext(ActionWorkflowContext);
}
