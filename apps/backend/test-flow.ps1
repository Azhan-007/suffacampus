$ErrorActionPreference = "Continue"
$token = Get-Content "$env:TEMP\token.txt" -Raw

$h = @{"Authorization"="Bearer $token"; "Content-Type"="application/json"}
$hNoBody = @{"Authorization"="Bearer $token"}  # for DELETE — no Content-Type

Write-Host "`n=== TEST 1: Create Student ===" -ForegroundColor Cyan
$studentBody = '{"firstName":"Test","lastName":"Student","classId":"class-6","sectionId":"A","rollNumber":"001","parentPhone":"9999999999","gender":"Male"}'
$studentBody | Out-File "$env:TEMP\student.json" -Encoding utf8 -NoNewline
$r1 = Invoke-RestMethod -Uri "http://localhost:5000/students" -Method POST -Headers $h -InFile "$env:TEMP\student.json"
Write-Host "CREATE: $($r1 | ConvertTo-Json -Compress)"
$studentId = $r1.id
Write-Host "Student ID: $studentId"

Write-Host "`n=== TEST 1b: List Students ===" -ForegroundColor Cyan
$r2 = Invoke-RestMethod -Uri "http://localhost:5000/students" -Method GET -Headers $hNoBody
Write-Host "COUNT: $($r2.Count) students"

Write-Host "`n=== TEST 1c: Delete Student ===" -ForegroundColor Cyan
$r3 = Invoke-RestMethod -Uri "http://localhost:5000/students/$studentId" -Method DELETE -Headers $hNoBody
Write-Host "DELETE: $($r3 | ConvertTo-Json -Compress)"

Write-Host "`n=== TEST 1d: List Students after delete (should be 0) ===" -ForegroundColor Cyan
$r3b = Invoke-RestMethod -Uri "http://localhost:5000/students" -Method GET -Headers $hNoBody
Write-Host "COUNT: $($r3b.Count) students"

Write-Host "`n=== TEST 1e: Mark attendance for DELETED student (must fail 404) ===" -ForegroundColor Cyan
$attDelBody = "{`"studentId`":`"$studentId`",`"date`":`"2026-02-21`",`"status`":`"Present`",`"classId`":`"class-6`",`"sectionId`":`"A`"}"
$attDelBody | Out-File "$env:TEMP\att_del.json" -Encoding utf8 -NoNewline
try {
    Invoke-RestMethod -Uri "http://localhost:5000/attendance" -Method POST -Headers $h -InFile "$env:TEMP\att_del.json"
    Write-Host "ERROR: Should have failed!" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "CORRECT: Got $code (404 expected) - $($_.ErrorDetails.Message)" -ForegroundColor Green
}

Write-Host "`n=== TEST 2: Create Teacher ===" -ForegroundColor Cyan
$teacherBody = '{"firstName":"Jane","lastName":"Doe","email":"jane.doe2@school.com","phone":"8888888888","subjects":["Math"],"department":"Science","employeeId":"T002","gender":"Female","qualification":"B.Ed"}'
$teacherBody | Out-File "$env:TEMP\teacher.json" -Encoding utf8 -NoNewline
$r5 = Invoke-RestMethod -Uri "http://localhost:5000/teachers" -Method POST -Headers $h -InFile "$env:TEMP\teacher.json"
Write-Host "CREATE: $($r5 | ConvertTo-Json -Compress)"
$teacherId = $r5.id
Write-Host "Teacher ID: $teacherId"

Write-Host "`n=== TEST 2b: Delete Teacher ===" -ForegroundColor Cyan
$r6 = Invoke-RestMethod -Uri "http://localhost:5000/teachers/$teacherId" -Method DELETE -Headers $hNoBody
Write-Host "DELETE: $($r6 | ConvertTo-Json -Compress)"

Write-Host "`n=== TEST 2c: List Teachers (should be 0) ===" -ForegroundColor Cyan
$r7 = Invoke-RestMethod -Uri "http://localhost:5000/teachers" -Method GET -Headers $hNoBody
Write-Host "COUNT: $($r7.Count) teachers"

Write-Host "`n=== TEST 3: Create student for attendance ===" -ForegroundColor Cyan
$s2Body = '{"firstName":"Attend","lastName":"Kid","classId":"class-7","sectionId":"B","rollNumber":"ATT001","parentPhone":"7777777777","gender":"Female"}'
$s2Body | Out-File "$env:TEMP\student2.json" -Encoding utf8 -NoNewline
$r8 = Invoke-RestMethod -Uri "http://localhost:5000/students" -Method POST -Headers $h -InFile "$env:TEMP\student2.json"
$sid2 = $r8.id
Write-Host "Student2 ID: $sid2"

Write-Host "`n=== TEST 3b: Mark Attendance ===" -ForegroundColor Cyan
$a2Body = "{`"studentId`":`"$sid2`",`"date`":`"2026-02-21`",`"status`":`"Present`",`"classId`":`"class-7`",`"sectionId`":`"B`"}"
$a2Body | Out-File "$env:TEMP\att2.json" -Encoding utf8 -NoNewline
$r9 = Invoke-RestMethod -Uri "http://localhost:5000/attendance" -Method POST -Headers $h -InFile "$env:TEMP\att2.json"
Write-Host "MARK: $($r9 | ConvertTo-Json -Compress)"

Write-Host "`n=== TEST 3c: Get Attendance (confirm visible) ===" -ForegroundColor Cyan
$r10 = Invoke-RestMethod -Uri "http://localhost:5000/attendance?date=2026-02-21" -Method GET -Headers $hNoBody
Write-Host "RECORDS: $($r10.Count) record(s) - $(($r10 | ConvertTo-Json -Compress))"

Write-Host "`n=== TEST 3d: Duplicate attendance (must be 409) ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "http://localhost:5000/attendance" -Method POST -Headers $h -InFile "$env:TEMP\att2.json"
    Write-Host "ERROR: Should have been 409!" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "CORRECT: Got $code (409 expected) - $($_.ErrorDetails.Message)" -ForegroundColor Green
}

Write-Host "`n=== TEST 4: Payment Order ===" -ForegroundColor Cyan
$payBody = '{"amount":99900,"currency":"INR","plan":"premium","durationDays":30}'
$payBody | Out-File "$env:TEMP\pay.json" -Encoding utf8 -NoNewline
try {
    $r11 = Invoke-RestMethod -Uri "http://localhost:5000/payments/create-order" -Method POST -Headers $h -InFile "$env:TEMP\pay.json"
    Write-Host "ORDER: $($r11 | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "Payment ($code): $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    Write-Host "(Expected if Razorpay keys are placeholders)" -ForegroundColor Yellow
}

Write-Host "`n=== ALL TESTS COMPLETE ===" -ForegroundColor Cyan


Write-Host "`n=== TEST 1: Create Student ===" -ForegroundColor Cyan
$studentBody = '{"firstName":"Test","lastName":"Student","classId":"class-6","sectionId":"A","rollNumber":"001","parentPhone":"9999999999","gender":"Male"}'
$studentBody | Out-File "$env:TEMP\student.json" -Encoding utf8 -NoNewline
$r1 = Invoke-RestMethod -Uri "http://localhost:5000/students" -Method POST -Headers $h -InFile "$env:TEMP\student.json"
Write-Host "CREATE: $($r1 | ConvertTo-Json -Compress)"
$studentId = $r1.id
Write-Host "Student ID: $studentId"

Write-Host "`n=== TEST 1b: List Students ===" -ForegroundColor Cyan
$r2 = Invoke-RestMethod -Uri "http://localhost:5000/students" -Method GET -Headers $h
Write-Host "COUNT: $($r2.Count) students"

Write-Host "`n=== TEST 1c: Delete Student ===" -ForegroundColor Cyan
$r3 = Invoke-RestMethod -Uri "http://localhost:5000/students/$studentId" -Method DELETE -Headers $h
Write-Host "DELETE: $($r3 | ConvertTo-Json -Compress)"

Write-Host "`n=== TEST 1d: Mark attendance for DELETED student (must fail) ===" -ForegroundColor Cyan
$attBody = "{`"studentId`":`"$studentId`",`"date`":`"2026-02-21`",`"status`":`"Present`"}"
$attBody | Out-File "$env:TEMP\att.json" -Encoding utf8 -NoNewline
try {
    $r4 = Invoke-RestMethod -Uri "http://localhost:5000/attendance" -Method POST -Headers $h -InFile "$env:TEMP\att.json"
    Write-Host "ERROR: Should have failed! Got: $($r4 | ConvertTo-Json -Compress)" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "CORRECT: Got $code - $($_.ErrorDetails.Message)" -ForegroundColor Green
}

Write-Host "`n=== TEST 2: Create Teacher ===" -ForegroundColor Cyan
$teacherBody = '{"firstName":"Jane","lastName":"Doe","email":"jane.doe@school.com","phone":"8888888888","subjects":["Math"],"department":"Science","employeeId":"T001","gender":"Female","qualification":"B.Ed"}'
$teacherBody | Out-File "$env:TEMP\teacher.json" -Encoding utf8 -NoNewline
$r5 = Invoke-RestMethod -Uri "http://localhost:5000/teachers" -Method POST -Headers $h -InFile "$env:TEMP\teacher.json"
Write-Host "CREATE: $($r5 | ConvertTo-Json -Compress)"
$teacherId = $r5.id
Write-Host "Teacher ID: $teacherId"

Write-Host "`n=== TEST 2b: Delete Teacher ===" -ForegroundColor Cyan
$r6 = Invoke-RestMethod -Uri "http://localhost:5000/teachers/$teacherId" -Method DELETE -Headers $h
Write-Host "DELETE: $($r6 | ConvertTo-Json -Compress)"

Write-Host "`n=== TEST 2c: List Teachers (should be 0) ===" -ForegroundColor Cyan
$r7 = Invoke-RestMethod -Uri "http://localhost:5000/teachers" -Method GET -Headers $h
Write-Host "COUNT: $($r7.Count) teachers"

Write-Host "`n=== TEST 3: Create fresh student for attendance ===" -ForegroundColor Cyan
$s2Body = '{"firstName":"Attend","lastName":"Kid","classId":"class-7","sectionId":"B","rollNumber":"002","parentPhone":"7777777777","gender":"Female"}'
$s2Body | Out-File "$env:TEMP\student2.json" -Encoding utf8 -NoNewline
$r8 = Invoke-RestMethod -Uri "http://localhost:5000/students" -Method POST -Headers $h -InFile "$env:TEMP\student2.json"
$sid2 = $r8.id
Write-Host "Student2 ID: $sid2"

Write-Host "`n=== TEST 3b: Mark Attendance ===" -ForegroundColor Cyan
$a2Body = "{`"studentId`":`"$sid2`",`"date`":`"2026-02-21`",`"status`":`"Present`"}"
$a2Body | Out-File "$env:TEMP\att2.json" -Encoding utf8 -NoNewline
$r9 = Invoke-RestMethod -Uri "http://localhost:5000/attendance" -Method POST -Headers $h -InFile "$env:TEMP\att2.json"
Write-Host "MARK: $($r9 | ConvertTo-Json -Compress)"

Write-Host "`n=== TEST 3c: Get Attendance (confirm visible) ===" -ForegroundColor Cyan
$r10 = Invoke-RestMethod -Uri "http://localhost:5000/attendance?date=2026-02-21" -Method GET -Headers $h
Write-Host "RECORDS: $($r10.Count) record(s)"

Write-Host "`n=== TEST 3d: Duplicate attendance (must be 409) ===" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "http://localhost:5000/attendance" -Method POST -Headers $h -InFile "$env:TEMP\att2.json"
    Write-Host "ERROR: Should have been 409!" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "CORRECT: Got $code (409 expected) - $($_.ErrorDetails.Message)" -ForegroundColor Green
}

Write-Host "`n=== TEST 4: Payment Order ===" -ForegroundColor Cyan
$payBody = '{"amount":99900,"currency":"INR","plan":"premium","durationDays":30}'
$payBody | Out-File "$env:TEMP\pay.json" -Encoding utf8 -NoNewline
try {
    $r11 = Invoke-RestMethod -Uri "http://localhost:5000/payments/create-order" -Method POST -Headers $h -InFile "$env:TEMP\pay.json"
    Write-Host "ORDER: $($r11 | ConvertTo-Json -Compress)" -ForegroundColor Green
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "Payment failed ($code): $($_.ErrorDetails.Message)" -ForegroundColor Yellow
    Write-Host "(Expected if Razorpay keys are placeholders)" -ForegroundColor Yellow
}

Write-Host "`n=== ALL TESTS COMPLETE ===" -ForegroundColor Cyan
