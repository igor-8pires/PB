-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "description" TEXT,
    "costPrice" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "purchaseUnit" TEXT,
    "unitsPerPurchaseUnit" REAL,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zipCode" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "locationId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BasePrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BasePrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BasePrice_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SellerProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "defaultMarginPercent" REAL NOT NULL,
    "minMarginPercent" REAL NOT NULL,
    "maxMarginPercent" REAL NOT NULL,
    "allowOrderMarginChange" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SellerProfile_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QuantityDiscount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sellerId" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "baseUnit" TEXT,
    "unit" TEXT,
    "minQuantity" INTEGER NOT NULL,
    "maxQuantity" INTEGER,
    "discountPercent" REAL NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QuantityDiscount_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "QuantityDiscount_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "QuantityDiscount_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "defaultMarginPercent" REAL NOT NULL,
    "appliedMarginPercent" REAL NOT NULL,
    "subtotal" REAL NOT NULL,
    "discount" REAL NOT NULL,
    "total" REAL NOT NULL,
    "notes" TEXT,
    "offlineSyncId" TEXT,
    "paymentTermsApprovedAt" DATETIME,
    "paymentTermsApprovedById" TEXT,
    "paymentDueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Order_paymentTermsApprovedById_fkey" FOREIGN KEY ("paymentTermsApprovedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "enteredQuantity" REAL,
    "enteredUnit" TEXT,
    "checkedForDelivery" BOOLEAN NOT NULL DEFAULT false,
    "basePrice" REAL NOT NULL,
    "marginPercent" REAL NOT NULL,
    "quantityDiscountPercent" REAL NOT NULL,
    "unitPrice" REAL NOT NULL,
    "total" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "recordedById" TEXT,
    "method" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enteredUnit" TEXT,
    "enteredQuantity" REAL,
    "unitCost" REAL,
    CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Delivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "courierId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" DATETIME,
    "startedAt" DATETIME,
    "deliveredAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Delivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Delivery_courierId_fkey" FOREIGN KEY ("courierId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryOccurrence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "deliveryId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeliveryOccurrence_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryOccurrence_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_key" ON "Product"("id");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE INDEX "Location_city_state_idx" ON "Location"("city", "state");

-- CreateIndex
CREATE INDEX "Customer_locationId_idx" ON "Customer"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "BasePrice_productId_locationId_key" ON "BasePrice"("productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerProfile_sellerId_key" ON "SellerProfile"("sellerId");

-- CreateIndex
CREATE INDEX "QuantityDiscount_sellerId_categoryId_baseUnit_unit_idx" ON "QuantityDiscount"("sellerId", "categoryId", "baseUnit", "unit");

-- CreateIndex
CREATE INDEX "QuantityDiscount_sellerId_productId_idx" ON "QuantityDiscount"("sellerId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_offlineSyncId_key" ON "Order"("offlineSyncId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_sellerId_idx" ON "Order"("sellerId");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");

-- CreateIndex
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");

-- CreateIndex
CREATE INDEX "Payment_recordedById_idx" ON "Payment"("recordedById");

-- CreateIndex
CREATE INDEX "StockMovement_productId_idx" ON "StockMovement"("productId");

-- CreateIndex
CREATE INDEX "StockMovement_orderId_idx" ON "StockMovement"("orderId");

-- CreateIndex
CREATE INDEX "Delivery_orderId_idx" ON "Delivery"("orderId");

-- CreateIndex
CREATE INDEX "Delivery_courierId_idx" ON "Delivery"("courierId");

-- CreateIndex
CREATE INDEX "Delivery_status_idx" ON "Delivery"("status");

-- CreateIndex
CREATE INDEX "DeliveryOccurrence_deliveryId_idx" ON "DeliveryOccurrence"("deliveryId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
