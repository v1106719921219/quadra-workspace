/**
 * リアルタイム在庫 API
 * Google Apps Script Web App
 *
 * 既存スクリプトと同じプロジェクトに追加する場合、
 * 定数・関数名が衝突しないよう全て INV_ プレフィックス付き
 */

var INV_HEADER_ROW = 3;
var INV_DATA_START_ROW = 4;
var INV_SHEET_YAMAGUCHI = "山口";
var INV_SHEET_TOKYO = "東京";

function doGet(e) {
  try {
    var loc = (e && e.parameter && e.parameter.location) || "all";
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var result = {};

    if (loc === "yamaguchi" || loc === "all") {
      var sheetY = ss.getSheetByName(INV_SHEET_YAMAGUCHI);
      result.yamaguchi = sheetY ? invReadSheet(sheetY) : [];
    }
    if (loc === "tokyo" || loc === "all") {
      var sheetT = ss.getSheetByName(INV_SHEET_TOKYO);
      result.tokyo = sheetT ? invReadSheet(sheetT) : [];
    }

    var anySheet = ss.getSheetByName(INV_SHEET_YAMAGUCHI) || ss.getSheetByName(INV_SHEET_TOKYO);
    if (anySheet) {
      var updateCell = anySheet.getRange(1, 1).getValue();
      result.last_updated = updateCell ? updateCell.toString() : "";
    }

    return ContentService.createTextOutput(
      JSON.stringify(result)
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    if (data.action === "update_orders") {
      return invUpdateOrders(data);
    }

    if (data.action === "save_pdf") {
      return expSavePdf(data);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ error: "Unknown action: " + data.action })
    ).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: err.message })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

function invReadSheet(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < INV_DATA_START_ROW) return [];

  var range = sheet.getRange(INV_DATA_START_ROW, 1, lastRow - INV_DATA_START_ROW + 1, 6);
  var data = range.getValues();

  var products = [];
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var name = row[0];
    if (!name || name.toString().trim() === "") continue;

    products.push({
      name: name.toString().trim(),
      type: (row[1] || "").toString().trim(),
      system_stock: parseInt(row[2]) || 0,
      arriving: parseInt(row[3]) || 0,
      total_stock: parseInt(row[4]) || 0,
      available: parseInt(row[5]) || 0
    });
  }

  return products;
}

function invUpdateOrders(data) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheetName = data.location === "tokyo" ? INV_SHEET_TOKYO : INV_SHEET_YAMAGUCHI;
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    return ContentService.createTextOutput(
      JSON.stringify({ error: "Sheet not found: " + sheetName })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var allData = sheet.getRange(INV_HEADER_ROW, 1, lastRow - INV_HEADER_ROW + 1, lastCol).getValues();

  var updated = 0;
  var errors = [];
  var orders = data.orders || [];

  for (var o = 0; o < orders.length; o++) {
    var order = orders[o];
    var found = false;

    for (var r = 1; r < allData.length; r++) {
      var productName = allData[r][0].toString().trim();
      if (productName !== order.product_name) continue;

      found = true;
      var slotFound = false;

      for (var c = 6; c < lastCol; c += 2) {
        var qty = allData[r][c];
        var company = allData[r][c + 1];

        if (!qty && !company) {
          var actualRow = INV_HEADER_ROW + r;
          sheet.getRange(actualRow, c + 1).setValue(order.quantity);
          sheet.getRange(actualRow, c + 2).setValue(order.company_name);
          updated++;
          slotFound = true;
          break;
        }
      }

      if (!slotFound) {
        errors.push(order.product_name + ": 空きスロットなし");
      }
      break;
    }

    if (!found) {
      errors.push(order.product_name + ": 商品が見つかりません");
    }
  }

  var result = { success: true, updated: updated };
  if (errors.length > 0) {
    result.errors = errors;
  }

  return ContentService.createTextOutput(
    JSON.stringify(result)
  ).setMimeType(ContentService.MimeType.JSON);
}

// ---- 立替経費精算書PDFをGoogle Driveに保存 ----

function expSavePdf(data) {
  try {
    var folderId = data.folderId;
    var fileName  = data.fileName;
    var pdfBase64 = data.pdfBase64;

    var folder = DriveApp.getFolderById(folderId);
    var bytes  = Utilities.base64Decode(pdfBase64);
    var blob   = Utilities.newBlob(bytes, 'application/pdf', fileName);
    var file   = folder.createFile(blob);

    // リンクを知っている全員が閲覧可能に設定
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      fileUrl: file.getUrl(),
      fileId:  file.getId()
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}
