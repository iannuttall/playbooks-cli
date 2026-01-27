export class UserCancelledError extends Error {
  constructor(message = 'Cancelled') {
    super(message);
    this.name = 'UserCancelledError';
  }
}

export class UserFacingError extends Error {
  exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'UserFacingError';
    this.exitCode = exitCode;
  }
}

export function isUserCancelled(error: unknown): error is UserCancelledError {
  return error instanceof UserCancelledError;
}

export function isUserFacing(error: unknown): error is UserFacingError {
  return error instanceof UserFacingError;
}
