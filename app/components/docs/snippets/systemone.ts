import { baseUrl } from "../config";

export const systemOneSnippets = {
  choice: `curl ${baseUrl}/v1/systemone \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-decision-model",
    "state": "The export button stopped working after the update.",
    "questions": {
      "team": {
        "type": "choice",
        "instructions": "Which team should handle this ticket?",
        "criteria": {
          "engineering": "Broken product features",
          "accounts": "Billing or account changes",
          "support": "General help using the product"
        }
      }
    }
  }'`,
  "probability & score": `curl ${baseUrl}/v1/systemone \\
  -H "Authorization: Bearer dgx_sk_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "your-decision-model",
    "state": {"ticket": "The export button stopped working after the update."},
    "questions": {
      "regression": {
        "type": "noul",
        "instructions": "Does this describe a regression after an update?"
      },
      "impact": {
        "type": "score",
        "instructions": "How much does this issue prevent using the product?",
        "criteria": ["Cosmetic only", "One feature unavailable", "Entire product unavailable"]
      }
    },
    "keep_alive": "5m"
  }'`,
};
