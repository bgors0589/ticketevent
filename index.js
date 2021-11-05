/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use strict";

const ticketEvent = require("./lib/ticketEvent");

module.exports.TicketEvent = ticketEvent;
module.exports.contracts = [ticketEvent];
