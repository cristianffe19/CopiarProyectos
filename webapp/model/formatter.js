// model/formatter.js
sap.ui.define([], function () {
    "use strict";

    return {

        formatODataDate: function (sDate) {
            if (!sDate) {
                return "";
            }

            // Extrae el timestamp del string "/Date(1703635200000)/"
            var oMatch = /\/Date\((\d+)\)\//.exec(sDate);
            if (!oMatch) {
                return sDate; // si no matchea el patrón, devuelve tal cual
            }

            var iTimestamp = parseInt(oMatch[1], 10);
            var oDate = new Date(iTimestamp);

            // Formatea como dd/MM/yyyy - ajusta el patrón a tu necesidad
            var oDateFormat = sap.ui.core.format.DateFormat.getDateInstance({
                pattern: "dd/MM/yyyy"
            });

            return oDateFormat.format(oDate);
        },

        // Variante con hora, por si ChangedOn trae hora también
        formatODataDateTime: function (sDate) {
    if (!sDate) {
        return "";
    }

    // Captura el timestamp y, opcionalmente, el offset (+0000, -0500, etc.)
    var oMatch = /\/Date\((-?\d+)([+-]\d{4})?\)\//.exec(sDate);
    if (!oMatch) {
        return sDate;
    }

    var iTimestamp = parseInt(oMatch[1], 10);
    var oDate = new Date(iTimestamp);

    var oDateTimeFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
        pattern: "dd/MM/yyyy HH:mm:ss"
    });

    return oDateTimeFormat.format(oDate);
}

    };
});