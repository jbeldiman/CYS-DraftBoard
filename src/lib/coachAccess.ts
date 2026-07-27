export type CoachDivision = "U11" | "U13";

export type CoachAccessShape = {
  coachesU11?: boolean | null;
  coachesU13?: boolean | null;
  u11CoachOrder?: number | null;
  u13CoachOrder?: number | null;
  isDraftCoach?: boolean | null;
  coachDivision?: CoachDivision | null;
  coachOrder?: number | null;
};

export function coachesDivision(user: CoachAccessShape | null | undefined, division: CoachDivision) {
  if (!user) return false;
  if (division === "U11") {
    return !!user.coachesU11 || (!!user.isDraftCoach && user.coachDivision === "U11");
  }
  return !!user.coachesU13 || (!!user.isDraftCoach && user.coachDivision === "U13");
}

export function divisionCoachOrder(user: CoachAccessShape, division: CoachDivision) {
  if (division === "U11") {
    return user.u11CoachOrder && user.u11CoachOrder > 0
      ? user.u11CoachOrder
      : user.coachDivision === "U11"
        ? user.coachOrder ?? 0
        : 0;
  }
  return user.u13CoachOrder && user.u13CoachOrder > 0
    ? user.u13CoachOrder
    : user.coachDivision === "U13"
      ? user.coachOrder ?? 0
      : 0;
}

export function legacyCoachFields(input: {
  coachesU11: boolean;
  coachesU13: boolean;
  u11CoachOrder: number;
  u13CoachOrder: number;
}) {
  const isDraftCoach = input.coachesU11 || input.coachesU13;
  if (input.coachesU11 && !input.coachesU13) {
    return {
      isDraftCoach,
      coachDivision: "U11" as const,
      coachOrder: input.u11CoachOrder,
    };
  }
  if (input.coachesU13 && !input.coachesU11) {
    return {
      isDraftCoach,
      coachDivision: "U13" as const,
      coachOrder: input.u13CoachOrder,
    };
  }
  return {
    isDraftCoach,
    coachDivision: null,
    coachOrder: 0,
  };
}
