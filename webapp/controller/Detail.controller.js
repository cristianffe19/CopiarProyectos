sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/List",
    "sap/m/CustomListItem",
    "sap/m/CheckBox",
    "sap/m/Text",
    "sap/m/HBox",
    "com/co/stratesys/zpscopiarproyectos/model/formatter"
], function (Controller, Filter, FilterOperator, Dialog, Button, List, CustomListItem, CheckBox, Text, HBox, formatter) {
    "use strict";

    return Controller.extend("com.co.stratesys.zpscopiarproyectos.controller.Detail", {

        formatter: formatter,

        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("RouteDetail")
                .attachPatternMatched(this._onObjectMatched, this);
        },

        _onObjectMatched: function (oEvent) {
            var sObjectId = decodeURIComponent(oEvent.getParameter("arguments").objectId);
            this._sProjectId = sObjectId;

            var oContext = this.getOwnerComponent().getDetailContext();

            if (oContext) {
                // Reutiliza el contexto tal cual, sin nueva consulta
                this.getView().setBindingContext(oContext);
            } else {
                // Fallback: si entran por URL directa (deep link/refresh), sí consulta
                this._loadProjectById(sObjectId);
            }

            this._loadRoles(sObjectId);
            this._loadWorkPackage(sObjectId);
            this._loadResourceDemand(sObjectId);
        },

        onTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            /*
                        if (!this._sProjectId) {
                            return;
                        }
                        
                                    switch (sKey) {
                                        case "roles":
                                            this._loadRoles(this._sProjectId);
                                            break;
                                        case "workPackage":
                                            this._loadWorkPackage(this._sProjectId);
                                            break;
                                        case "resourceDemand":
                                            this._loadResourceDemand(this._sProjectId);
                                            break;
                                    }
                         */
        },

        _loadRoles: function (sProjectId) {
            debugger;
            var oBinding = this.byId("rolesTable").getBinding("items");
            if (oBinding) {
                oBinding.filter([new Filter("ProjectID", FilterOperator.EQ, sProjectId)]);
            }

        },
        _loadWorkPackage: function (sProjectId) {
            var oTable = this.byId("workPackageTable");
            var oBinding = oTable.getBinding("rows");
            if (oBinding) {
                oBinding.filter([new Filter("ProjectID", FilterOperator.EQ, sProjectId)]);
            }
        },

        _loadResourceDemand: function (sProjectId) {
            var oTable = this.byId("resourceDemandTable");
            var oBinding = oTable.getBinding("rows");
            if (oBinding) {
                oBinding.filter([new Filter("EngagementProject", FilterOperator.EQ, sProjectId)]);
            }
        },
        onCloseDetail: function () {
            this.getOwnerComponent().getRouter().navTo("RouteMaster");
        },

        onColumnSettings: function (oEvent) {
            // El botón que dispara esto debe tener customData="tableId" con el id de la tabla objetivo
            var sTableId = oEvent.getSource().data("tableId");
            var oTable = this.byId(sTableId);

            this._oColumnSettingsDialogs = this._oColumnSettingsDialogs || {};

            if (!this._oColumnSettingsDialogs[sTableId]) {
                var aColumns = oTable.getColumns();
                var oList = new List();

                aColumns.forEach(function (oColumn) {
                    var oHeaderControl = oColumn.getLabel();
                    var sLabel = oHeaderControl.getText
                        ? oHeaderControl.getText()
                        : oColumn.getId();

                    var oCheckBox = new CheckBox({
                        selected: oColumn.getVisible(),
                        select: function (oCbEvent) {
                            oColumn.setVisible(oCbEvent.getParameter("selected"));
                        }
                    });

                    oList.addItem(new CustomListItem({
                        content: new HBox({
                            items: [
                                oCheckBox,
                                new Text({ text: sLabel }).addStyleClass("sapUiTinyMarginBegin")
                            ]
                        })
                    }));
                }, this);

                var oDialog = new Dialog({
                    title: "{i18n>columnSettingsTitle}",
                    contentWidth: "20em",
                    content: [oList],
                    beginButton: new Button({
                        text: "{i18n>columnSettingsClose}",
                        press: function () {
                            oDialog.close();
                        }
                    })
                });

                this.getView().addDependent(oDialog);
                this._oColumnSettingsDialogs[sTableId] = oDialog;
            }

            this._oColumnSettingsDialogs[sTableId].open();
        },

        onFormFieldSettings: function () {
            var oContainer = this.byId("projectHeaderBox");
            var aFields = oContainer.getItems(); // ObjectAttribute / ObjectStatus directos

            if (!this._oFormFieldDialog) {
                var oList = new List();

                aFields.forEach(function (oField) {
                    var sLabelText = oField.getTitle ? oField.getTitle() : oField.getId();

                    var oCheckBox = new CheckBox({
                        selected: oField.getVisible(),
                        select: function (oEvent) {
                            oField.setVisible(oEvent.getParameter("selected"));
                        }
                    });

                    oList.addItem(new CustomListItem({
                        content: new HBox({
                            items: [
                                oCheckBox,
                                new Text({ text: sLabelText }).addStyleClass("sapUiTinyMarginBegin")
                            ]
                        })
                    }));
                });

                this._oFormFieldDialog = new Dialog({
                    title: "{i18n>fieldSettingsTitle}",
                    contentWidth: "20em",
                    content: [oList],
                    beginButton: new Button({
                        text: "{i18n>columnSettingsClose}",
                        press: function () {
                            this._oFormFieldDialog.close();
                        }.bind(this)
                    })
                });

                this.getView().addDependent(this._oFormFieldDialog);
            }

            this._oFormFieldDialog.open();
        },


        onToggleHeaderForm: function () {
            var oContainer = this.byId("projectHeaderBox");
            var oToggleBtn = this.byId("toggleHeaderFormBtn");
            var bVisible = oContainer.getVisible();

            oContainer.setVisible(!bVisible);
            oToggleBtn.setIcon(bVisible ? "sap-icon://slim-arrow-down" : "sap-icon://slim-arrow-up");
        },

        _loadProjectById: function (sProjectId) {
            var oView = this.getView();
            var oPage = this.byId("detailPage");

            // Ojo con el formato de la clave: ver nota abajo
            var sPath = "/QueryProy(ProjectID='" + encodeURIComponent(sProjectId) + "')";

            oPage.setBusy(true);

            var oContext = oView.getModel().bindContext(sPath).getBoundContext();

            oContext.requestObject().then(function (oData) {
                oPage.setBusy(false);
                if (oData) {
                    oView.setBindingContext(oContext);
                } else {
                    MessageBox.error("No se encontró el proyecto " + sProjectId);
                }
            }).catch(function (oError) {
                oPage.setBusy(false);
                MessageBox.error("Error al cargar el proyecto: " + oError.message);
            });
        }
    });
});