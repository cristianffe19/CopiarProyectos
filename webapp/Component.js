sap.ui.define([
    "sap/ui/core/UIComponent",
    "com/co/stratesys/zpscopiarproyectos/model/models"
], (UIComponent, models) => {
    "use strict";

    return UIComponent.extend("com.co.stratesys.zpscopiarproyectos.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");
            // enable routing
            this.getRouter().initialize();
        },

        setDetailContext: function (oContext) {
            this._oDetailContext = oContext;
        },

        getDetailContext: function () {
            return this._oDetailContext;
        }
    });
});