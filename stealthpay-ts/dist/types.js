"use strict";
/**
 * Type definitions for StealthPay TypeScript SDK
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelStatus = exports.EscrowStatus = exports.PaymentStatus = void 0;
var PaymentStatus;
(function (PaymentStatus) {
    PaymentStatus["PENDING"] = "pending";
    PaymentStatus["CONFIRMED"] = "confirmed";
    PaymentStatus["FAILED"] = "failed";
})(PaymentStatus || (exports.PaymentStatus = PaymentStatus = {}));
var EscrowStatus;
(function (EscrowStatus) {
    EscrowStatus["PENDING"] = "pending";
    EscrowStatus["FUNDED"] = "funded";
    EscrowStatus["DELIVERED"] = "delivered";
    EscrowStatus["COMPLETED"] = "completed";
    EscrowStatus["DISPUTED"] = "disputed";
    EscrowStatus["REFUNDED"] = "refunded";
    EscrowStatus["EXPIRED"] = "expired";
})(EscrowStatus || (exports.EscrowStatus = EscrowStatus = {}));
var ChannelStatus;
(function (ChannelStatus) {
    ChannelStatus["PENDING"] = "pending";
    ChannelStatus["OPEN"] = "open";
    ChannelStatus["CLOSING"] = "closing";
    ChannelStatus["CLOSED"] = "closed";
    ChannelStatus["DISPUTED"] = "disputed";
})(ChannelStatus || (exports.ChannelStatus = ChannelStatus = {}));
