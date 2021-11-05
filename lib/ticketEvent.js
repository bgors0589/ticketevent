/*
 * Copyright IBM Corp. All Rights Reserved.
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use strict";

const { Contract } = require("fabric-contract-api");

const balancePrefix = "balance";

class TicketEvent extends Contract {
	// CreateEvent emite un nuevo evento al estado mundial con los detalles dados.
	async CreateEvent(ctx, name, date, place, urlImageEvent) {
		const id = ctx.stub.getTxID();

		// Obtener ID de la identidad del cliente
		const owner = ctx.clientIdentity.getID();

		// const aditional = {
		// 	Zone: zone,
		// 	NumTickets: numTickets,
		// 	TicketPrice: ticketPrice,
		// };

		const event = {
			docType: "event",
			ID: id,
			Name: name,
			Date: date,
			Place: place,
			UrlImageEvent: urlImageEvent,
			Owner: owner,
		};
		//insertamos datos en orden alfabético usando 'json-stringify-deterministic' y 'sort-keys-recursive'
		await ctx.stub.putState(
			id,
			Buffer.from(stringify(sortKeysRecursive(event)))
		);
		return JSON.stringify(event);
	}

	// EventExists devuelve verdadero cuando el evento con el ID dado existe en el estado mundial.
	async EventExists(ctx, id) {
		const assetJSON = await ctx.stub.getState(id);
		return assetJSON && assetJSON.length > 0;
	}

	// UpdatePlaceRemainingEvent actualiza los lugares restantes del evento
	async UpdatePlaceRemainingEvent(ctx, id, zone) {
		//revisar que el evento exista
		const exists = await this.EventExists(ctx, id);
		if (!exists) {
			throw new Error(`The asset ${id} does not exist`);
		}

		const event = this.ReadEvent(ctx, id);

		event.Place[zone].remain--; //disminuya la cantidad de boletas

		let assetJSONasBytes = Buffer.from(JSON.stringify(event));
		await ctx.stub.putState(id, assetJSONasBytes); //reescriba el evento
	}

	// UpdateEvent actualiza un evento existente en el estado mundial con parametros que proveen.
	async UpdateEvent(ctx, id, name, date, place, urlImageEvent) {
		//revisar que el evento exista
		const exists = await this.EventExists(ctx, id);
		if (!exists) {
			throw new Error(`The asset ${id} does not exist`);
		}

		//revisar que el propietario del evento sea el que lo esta actualizando
		const owner = ctx.clientIdentity.getID();
		const ev = await this.ReadEvent(ctx, id);
		if (ev.owner != owner) {
			throw new Error(`Only the owner can modify the event `);
		}

		//Sobreescribiendo el evento actual con los nuevos parametros
		const updatedEvent = {
			docType: "event",
			ID: id,
			Name: name,
			Date: date,
			Place: place,
			UrlImageEvent: urlImageEvent,
			Owner: owner,
		};
		//insertamos datos en orden alfabético usando 'json-stringify-deterministic' y 'sort-keys-recursive'
		return ctx.stub.putState(
			id,
			Buffer.from(stringify(sortKeysRecursive(updatedEvent)))
		);
	}

	// GetAllEvents devuelve todos los eventos enconntrados en el estado mundial.
	async GetAllEvents(ctx) {
		const allResults = [];
		// La consulta de rango con una cadena vacía para startKey y endKey realiza una consulta abierta de todos los activos en el espacio de nombres del código de cadena.
		const iterator = await ctx.stub.getStateByRange("", "");
		let result = await iterator.next();
		while (!result.done) {
			const strValue = Buffer.from(result.value.value.toString()).toString(
				"utf8"
			);
			let record;
			try {
				record = JSON.parse(strValue);
			} catch (err) {
				console.log(err);
				record = strValue;
			}
			allResults.push(record);
			result = await iterator.next();
		}
		return JSON.stringify(allResults);
	}

	// ReadEvent devuelve el activo almacenado en el estado mundial con la identificación dada.
	async ReadEvent(ctx, id) {
		const assetJSON = await ctx.stub.getState(id); // obtener el activo del estado del código de cadena
		if (!assetJSON || assetJSON.length === 0) {
			throw new Error(`The asset ${id} does not exist`);
		}
		return assetJSON.toString();
	}

	async BuyTicket(ctx, idEvent, zone, confPago) {
		//revisar que el evento exista
		const exists = await this.EventExists(ctx, idEvent);
		if (!exists) {
			throw new Error(`The asset ${id} does not exist`);
		}

		//Deben quedar boletos
		const event = await ctx.stub.getState(idEvent);

		if (event.Place[zone].remain > 0) {
			throw new Error(`No quedan Boletos`);
		}

		//EN ETH
		//El pago debe ser exacto al precio del boleto
		//Esto evita la necesidad de reembolsos (posible reentrada) o
		//para esquemas de abstinencia.
		//require(msg.value == events[eventId].price, "Payment did not match event ticket price"); ETH
		//EventData[] public events;

		//Emitir el Nuevo Ticket y asignarlo al Usuario
		const tick = this.CreateTicket(ctx, idEvent, confPago);

		//Disminuir los tickets restantes
		this.UpdatePlaceRemainingEvent(ctx, idEvent, zone);

		//retornar el ID del Ticket
		return tick.ID;
	}

	async CreateTicket(ctx, idEvent, confPago) {
		const id = ctx.stub.getTxID();

		// Obtener ID de la identidad del cliente
		const owner = ctx.clientIdentity.getID();

		const ticket = {
			docType: "ticket",
			ID: id,
			IdEvent: idEvent,
			Owner: owner,
			redeemed: false,
			ConfPago: confPago,
		};
		//insertamos datos en orden alfabético usando 'json-stringify-deterministic' y 'sort-keys-recursive'
		await ctx.stub.putState(
			id,
			Buffer.from(stringify(sortKeysRecursive(ticket)))
		);

		const balanceKey = ctx.stub.createCompositeKey(balancePrefix, [owner, id]);
		await ctx.stub.putState(balanceKey, Buffer.from("\u0000"));

		return JSON.stringify(ticket);
	}

	async ClientAccountBalance(ctx) {
		// Obtener ID de la identidad del cliente
		const clientAccountID = ctx.clientIdentity.getID();
		return this.BalanceOf(ctx, clientAccountID);
	}

	// ClientAccountID devuelve el id de la cuenta del cliente solicitante.
	// En esta implementación, el ID de la cuenta del cliente es el propio clientId.
	// Los usuarios pueden usar esta función para obtener su propia identificación de cuenta, que luego pueden dar a otros como la dirección de pago
	async ClientAccountID(ctx) {
		// Obtener ID de la identidad del cliente
		const clientAccountID = ctx.clientIdentity.getID();
		return clientAccountID;
	}

	async BalanceOf(ctx, owner) {
		// Hay un registro de clave para cada token no fungible en el formato balancePrefix.owner.tokenId.
		// BalanceOf () consulta y cuenta todos los registros que coinciden con balancePrefix.owner. *
		const iterator = await ctx.stub.getStateByPartialCompositeKey(
			balancePrefix,
			[owner]
		);

		// Cuente el número de claves compuestas devueltas
		let balance = 0;
		let result = await iterator.next();
		while (!result.done) {
			balance++;
			result = await iterator.next();
		}
		return balance;
	}

	async MyTickets(ctx) {
		// Obtener ID de la identidad del cliente
		const owner = ctx.clientIdentity.getID();
		let queryString = {};
		queryString.selector = {};
		queryString.selector.docType = "ticket";
		queryString.selector.Owner = owner;
		return await this.GetQueryResultForQueryString(
			ctx,
			JSON.stringify(queryString)
		);
	}

	async MyEvents(ctx) {
		// Obtener ID de la identidad del cliente
		const owner = ctx.clientIdentity.getID();
		let queryString = {};
		queryString.selector = {};
		queryString.selector.docType = "ticket";
		queryString.selector.Owner = owner;
		return await this.GetQueryResultForQueryString(
			ctx,
			JSON.stringify(queryString)
		);
	}

	// Elimina el Evento del estado gloval.
	async DeleteEvent(ctx, id) {
		if (!id) {
			throw new Error("Asset name must not be empty");
		}

		let exists = await this.EventExists(ctx, id);
		if (!exists) {
			throw new Error(`Asset ${id} does not exist`);
		}

		let valAsbytes = await ctx.stub.getState(id); // Obtenga el evento
		let jsonResp = {};
		if (!valAsbytes) {
			jsonResp.error = `Asset does not exist: ${id}`;
			throw new Error(jsonResp);
		}
		let assetJSON;
		try {
			assetJSON = JSON.parse(valAsbytes.toString());
		} catch (err) {
			jsonResp = {};
			jsonResp.error = `Failed to decode JSON of: ${id}`;
			throw new Error(jsonResp);
		}
		await ctx.stub.deleteState(id); //Eliminar del estado global
	}

	// TransferTicket transfiere un ticket estableciendo un nuevo nombre de propietario.
	async TransferTicket(ctx, idTicket, newOwner) {
		let assetAsBytes = await ctx.stub.getState(idTicket);
		if (!assetAsBytes || !assetAsBytes.toString()) {
			throw new Error(`Ticket ${idTicket} does not exist`);
		}
		let assetToTransfer = {};
		try {
			assetToTransfer = JSON.parse(assetAsBytes.toString()); //unmarshal
		} catch (err) {
			let jsonResp = {};
			jsonResp.error = "Failed to decode JSON of: " + idTicket;
			throw new Error(jsonResp);
		}

		// Obtener ID de la identidad del cliente
		const owner = ctx.clientIdentity.getID();

		// Verificar si el actual propietario del boleto es el que lo va a transferir
		if (owner !== assetToTransfer.Owner) {
			throw new Error("The from is not the current owner.");
		}

		assetToTransfer.Owner = newOwner; //cambie el propietario

		let assetJSONasBytes = Buffer.from(JSON.stringify(assetToTransfer));
		await ctx.stub.putState(idTicket, assetJSONasBytes); //reescriba el ticket
	}

	//Aqui se redime el boleto
	async ReedemTicket(ctx, ticketId, eventId) {
		// Buscar el dueño del evento y solo el puede redimir el ticket
		let event = await ctx.stub.getState(eventId);
		if (!event || !event.toString()) {
			throw new Error(`Event ${eventId} does not exist`);
		}
		let assetToTransfer = {};
		try {
			assetToTransfer = JSON.parse(event.toString()); //unmarshal
		} catch (err) {
			let jsonResp = {};
			jsonResp.error = "Failed to decode JSON of: " + eventId;
			throw new Error(jsonResp);
		}

		// Obtener ID de la identidad del cliente
		const owner = ctx.clientIdentity.getID();

		// Verificar si el actual propietario del boleto es el que lo va a transferir
		if (owner !== assetToTransfer.Owner) {
			throw new Error("The person who redeems is not the current owner.");
		}
		// Verificar que el ticket exista
		let ticket = await ctx.stub.getState(ticketId);
		if (!ticket || !ticket.toString()) {
			throw new Error(`Ticket ${ticketId} does not exist`);
		}
		// Verificar que el ticket pertenezca al evento
		if (ticket.IdEvent !== eventId) {
			throw new Error(`Ticket ${ticketId} does not belong to the event `);
		}
		// Cambiar el ticket a Redimido(true) en el estado Global
		let assetToRedeem = {};
		try {
			assetToRedeem = JSON.parse(ticket.toString()); //unmarshal
		} catch (err) {
			let jsonResp = {};
			jsonResp.error = "Failed to decode JSON of: " + ticketId;
			throw new Error(jsonResp);
		}

		assetToRedeem.redeemed = true; //cambie a verdadero el boleto redimido

		let ticketJSONasBytes = Buffer.from(JSON.stringify(assetToRedeem));
		await ctx.stub.putState(ticketId, ticketJSONasBytes); //reescriba el ticket
	}

	//Borrar mis ticket de estado global.
	async BorrarTicket(ctx, ticketId) {
		if (!ticketId) {
			throw new Error("Asset name must not be empty");
		}

		let exists = await ctx.stub.getState(ticketId); // Obtenga el ticket
		if (!exists) {
			throw new Error(`Asset ${ticketId} does not exist`);
		}

		let assetJSON;
		try {
			assetJSON = JSON.parse(exists.toString());
		} catch (err) {
			jsonResp = {};
			jsonResp.error = `Failed to decode JSON of: ${ticketId}`;
			throw new Error(jsonResp);
		}
		await ctx.stub.deleteState(ticketId); //Eliminar del estado global
	}

	// Verificar si el ticket es redimible
	// Valida un boleto segun la identidad y que el boleto
	// sea válido para el ID de evento proporcionado, además de no canjeado.
	// Resultados
	//  * 1 = boleto ya canjeado
	//  * 2 = el ticket no existe
	//  * 3 = la firma no coincide con el propietario del boleto
	//  * 4 = la entrada no pertenece al evento
	//  * 5 = boleto válido
	//  * /
	async isRedeemable(eventId, ticketId, idPropietario, code) {
		// esto repite una verificación de isValid, pero es necesario para asegurarse
		// de que la siguiente verificación no falle
		// si el id del boleto proporcionado no existe devuelve 2
		let ticketAsBytes = await ctx.stub.getState(ticketId);
		if (!ticketAsBytes || !ticketAsBytes.toString()) return 2;

		let assetToTransfer = {};
		try {
			assetToTransfer = JSON.parse(ticketAsBytes.toString()); //unmarshal
		} catch (err) {
			let jsonResp = {};
			jsonResp.error = "Failed to decode JSON of: " + assetName;
			throw new Error(jsonResp);
		}

		// Si el boleto esta redimido devuelve 1
		if (assetToTransfer.redeemed) return 1;

		return isValid(eventId, ticketId, idPropietario, code);
	}

	// Valida un boleto csegun la identidad y que el boleto sea válido para el ID de evento
	// proporcionado. El anfitrión del evento le dará al asistente un código de un solo uso.
	// El asistente proporcionará su ID de entrada y una firma del sha3 (ID de entrada + código
	// de un solo uso). A partir de esto, el anfitrión del evento puede determinar en el momento
	// de la entrada que el asistente es el propietario de un boleto válido.
	// resultado.
	//  * 2 = el ticket no existe
	//  * 3 = la firma no coincide con el propietario del boleto
	//  * 4 = la entrada no pertenece al evento
	//  * 5 = boleto válido
	//  * /
	async isValid(eventId, ticketId, idPropietario, code) {
		// El boleto debe existir; esto es fácil ya que los ID de los tickets son solo índices de matriz
		let ticketAsBytes = await ctx.stub.getState(ticketId);
		if (!ticketAsBytes || !ticketAsBytes.toString()) return 2;

		let assetToTransfer = {};
		try {
			assetToTransfer = JSON.parse(ticketAsBytes.toString()); //unmarshal
		} catch (err) {
			let jsonResp = {};
			jsonResp.error = "Failed to decode JSON of: " + assetName;
			throw new Error(jsonResp);
		}

		//EN ETH
		// La firma proporcionada debe ser de la dirección a la que pertenece el boleto
		// if (recovery(msgHash, v, r, s) != tokenOwner[ticketId]) return 3;
		//
		// El propietario del ticket es la persona que muestra el Qr --
		// Date.now().toString().substr(2, 4)

		const verifCode = Date.now().toString().substr(2, 4);
		if (idPropietario !== assetToTransfer.Owner && verifCode !== code) return 3;

		// El boleto debe pertenecer al Evento
		if (assetToTransfer.IdEvent != eventId) return 4;

		return 5;
	}
}

module.exports = TicketEvent;
