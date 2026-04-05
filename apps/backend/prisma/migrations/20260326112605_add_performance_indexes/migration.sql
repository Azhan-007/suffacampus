-- CreateIndex
CREATE INDEX "Activity_userId_idx" ON "Activity"("userId");

-- CreateIndex
CREATE INDEX "Activity_schoolId_userId_createdAt_idx" ON "Activity"("schoolId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "Fee_schoolId_createdAt_idx" ON "Fee"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "Fee_schoolId_dueDate_idx" ON "Fee"("schoolId", "dueDate");

-- CreateIndex
CREATE INDEX "Student_schoolId_createdAt_idx" ON "Student"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "Student_firstName_lastName_idx" ON "Student"("firstName", "lastName");
