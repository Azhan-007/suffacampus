import { prisma } from "../lib/prisma";
import { assertSchoolScope } from "../lib/tenant-scope";

export type FcmDeviceTokenContext = {
  userId: string;
  schoolId: string;
};

export async function registerFcmDeviceToken(
  token: string,
  context: FcmDeviceTokenContext
) {
  assertSchoolScope(context.schoolId);

  const existing = await prisma.deviceToken.findFirst({
    where: {
      token,
      userId: context.userId,
      schoolId: context.schoolId,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.deviceToken.create({
    data: {
      token,
      userId: context.userId,
      schoolId: context.schoolId,
    },
  }).catch(async (err: unknown) => {
    const known = await prisma.deviceToken.findFirst({
      where: {
        token,
        userId: context.userId,
        schoolId: context.schoolId,
      },
    });

    if (known) return known;
    throw err;
  });
}

export async function removeFcmDeviceToken(
  token: string,
  context: FcmDeviceTokenContext
) {
  assertSchoolScope(context.schoolId);

  const result = await prisma.deviceToken.deleteMany({
    where: {
      token,
      userId: context.userId,
      schoolId: context.schoolId,
    },
  });

  return result.count > 0;
}
