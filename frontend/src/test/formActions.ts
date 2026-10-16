import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Finder = Pick<typeof screen, "getByLabelText">;
type Label = string | RegExp;

/** The only place that knows how the shared form inputs are operated in a test. */
export function setDate(label: Label, iso: string, scope: Finder = screen): void {
  fireEvent.change(scope.getByLabelText(label), { target: { value: iso } });
}

export function setTime(label: Label, hhmm: string, scope: Finder = screen): void {
  fireEvent.change(scope.getByLabelText(label), { target: { value: hhmm } });
}

export function setText(label: Label, value: string, scope: Finder = screen): void {
  fireEvent.change(scope.getByLabelText(label), { target: { value } });
}

export async function chooseOption(label: Label, option: string, scope: Finder = screen): Promise<void> {
  await userEvent.selectOptions(scope.getByLabelText(label), option);
}

export async function toggle(label: Label, scope: Finder = screen): Promise<void> {
  await userEvent.click(scope.getByLabelText(label));
}

/**
 * Chooses a file as a person can with "all files" in the browser's dialog: the input's `accept` is only a hint to
 * that dialog, so a file it does not list still reaches the form, which must refuse it itself.
 */
export async function pickFile(label: Label, file: File, scope: Finder = screen): Promise<void> {
  await userEvent.setup({ applyAccept: false }).upload(scope.getByLabelText(label), file);
}
