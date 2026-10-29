INSERT INTO students(id,name,phone,group_name,monthly_fee) VALUES
 (1,'Abdullayev Mirzo','+998900000101','IELTS-1',70000000),
 (2,'Karimova Sevinch','+998900000102','General-2',60000000),
 (3,'Murodov Sardor','+998900000103','IELTS-1',70000000),
 (4,'Tursunova Nigina','+998900000104','Beginner-1',50000000),
 (5,'Rahmonov Azizbek','+998900000105','Speaking-1',70000000),
 (6,'Ismoilova Dilnoza','+998900000106','General-2',60000000),
 (7,'Yusupov Behzod','+998900000107','IELTS-2',80000000),
 (8,'Qodirova Maftuna','+998900000108','Beginner-2',50000000)
ON CONFLICT(id) DO NOTHING;
INSERT INTO payments(student_id,amount,date,method,idempotency_key) VALUES
 (1,70000000,date('now','+5 hours','start of month'),'manual','seed-payment-1'),
 (3,70000000,date('now','+5 hours','start of month'),'manual','seed-payment-3'),
 (4,25000000,date('now','+5 hours','start of month'),'manual','seed-payment-4'),
 (6,60000000,date('now','+5 hours','start of month'),'manual','seed-payment-6'),
 (7,40000000,date('now','+5 hours','start of month'),'manual','seed-payment-7')
ON CONFLICT(idempotency_key) DO NOTHING;
