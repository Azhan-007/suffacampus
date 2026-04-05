import { prisma } from "../lib/prisma";

export type FcmDeviceTokenContext = {
  userId: string;
  schoolId: string;
};

export async function registerFcmDeviceToken(
  token: string,
  context: FcmDeviceTokenContext
) {
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
  const result = await prisma.deviceToken.deleteMany({
    where: {
      token,
      userId: context.userId,
      schoolId: context.schoolId,
    },
  });

  return result.count > 0;
}
