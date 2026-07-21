/** Uniform server-action result: success fields are optional, error is optional. */
export type ActionResult<T extends object = object> = {
  ok?: boolean;
  error?: string;
} & Partial<T>;
