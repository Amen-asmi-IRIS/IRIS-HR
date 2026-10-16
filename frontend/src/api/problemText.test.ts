import { describe, expect, it } from "vitest";
import i18n from "@/i18n";
import { networkProblem, ProblemError } from "./problem";
import { problemText } from "./problemText";

describe("problemText", () => {
  it("uses the sentence of the API when it sent one", () => {
    const problem = new ProblemError({ status: 400, code: "files.too_large", detail: "Le fichier dépasse 10 Mo." });
    expect(problemText(problem, i18n.t)).toBe("Le fichier dépasse 10 Mo.");
  });

  it("calls a body the proxy refused too large", () => {
    const problem = new ProblemError({ status: 413, code: "core.unexpected", detail: "" });
    expect(problemText(problem, i18n.t)).toBe("Ce fichier est trop volumineux pour être envoyé.");
  });

  it("tells an application that cannot be reached from one that is being updated", () => {
    expect(problemText(networkProblem(), i18n.t)).toBe("L'application est injoignable. Vérifiez votre connexion et réessayez.");
    expect(problemText(new ProblemError({ status: 503, code: "core.unavailable", detail: "" }), i18n.t)).toBe(
      "L'application est en cours de mise à jour. Elle sera de retour dans un instant.",
    );
  });

  it("says something went wrong for anything else", () => {
    expect(problemText(new Error("boom"), i18n.t)).toBe("Une erreur est survenue. Veuillez réessayer.");
  });
});
