sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageBox",
    "sap/m/MessageView",
    "sap/m/Popover",
    "sap/m/MessageItem",
    "sap/m/Button",
    "sap/m/Bar",
    "sap/m/Text",
    "sap/ui/core/library"


], function (Controller, Filter, FilterOperator, MessageBox, MessageView, Popover, MessageItem, Button, Bar, Text, coreLibrary) {
    "use strict";

    var SAP_SEVERITY = { SUCCESS: 1, INFO: 2, WARNING: 3, ERROR: 4, ABORT: 5 };
    var MessageType = coreLibrary.MessageType;

    return Controller.extend("com.co.stratesys.zpscopiarproyectos.controller.Master", {

        onInit: function () {
            this._oProjectDataCache = {};
            this._aSelectedProjects = [];
            this._aFullProjectData = [];
            this._oList = this.byId("proyectosList");

            this._oFilterState = {
                search: [],
                perfilProyecto: [],
                estadoProcesamiento: []
            };

            this.getOwnerComponent().getRouter()
                .getRoute("RouteMaster")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            // Punto de extensión: refrescar datos, limpiar selección, etc.
        },
        /*
                onSearch: function (oEvent) {
                    var sQuery = oEvent.getParameter("newValue"),
                        aFilters = [];
        
                    if (sQuery) {
                        aFilters.push(new Filter({
                            filters: [
                                new Filter("ProjectID", FilterOperator.Contains, sQuery),
                                new Filter("ProjectName", FilterOperator.Contains, sQuery)
                            ],
                            and: true
                        }));
                    }
        
                    this._oList.getBinding("items").filter(aFilters);
                },
                */

        onPress: function (oEvent) {
            this._showDetail(oEvent.getSource());
        },

        // Master.controller.js
        _showDetail: function (oItem) {
            var oContext = oItem.getBindingContext();
            var sProjectId = oContext.getProperty("ProjectID");

            // Guarda el contexto para que el Detail lo reutilice sin re-consultar
            this.getOwnerComponent().setDetailContext(oContext);

            this.getOwnerComponent().getRouter().navTo("RouteDetail", {
                objectId: encodeURIComponent(sProjectId)
            });
        },

        onSelectionChange: function (oEvent) {
            var oList = this.byId("proyectosList");
            var aContexts = oList.getSelectedContexts(true);

            this._aSelectedProjects = aContexts.map(function (oContext) {
                return oContext.getObject();
            });

            this._loadFullProjectData(aContexts);
        },

        _loadFullProjectData: function (aListContexts) {
            var oModel = this.getView().getModel();
            var oList = this.byId("proyectosList");

            // Solo pide lo que aún no está en cache
            var aPending = aListContexts.filter(function (oContext) {
                var sProjectId = oContext.getProperty("ProjectID");
                return !this._oProjectDataCache[sProjectId];
            }, this);

            if (!aPending.length) {
                // Todo ya estaba en cache, no se hace ninguna llamada
                return Promise.resolve(this._getSelectedFromCache(aListContexts));
            }

            oList.setBusy(true);

            var aPromises = aPending.map(function (oListContext) {
                var sProjectId = oListContext.getProperty("ProjectID");
                //var sHeaderPath = "/CopyProy(ProjectID='" + encodeURIComponent(sProjectId) + "')";
                //var oHeaderContext = oModel.bindContext(sHeaderPath).getBoundContext();

                return Promise.all([
                    //oHeaderContext.requestObject(),
                    this._readList(oModel, "/CopyProy", "ProjectID", sProjectId),
                    this._readList(oModel, "/QueryRoles", "ProjectID", sProjectId),
                    this._readList(oModel, "/QueryPackage", "ProjectID", sProjectId),
                    this._readList(oModel, "/QueryDemand", "EngagementProject", sProjectId)
                ]).then(function (aResults) {
                    this._oProjectDataCache[sProjectId] = {
                        header: aResults[0],
                        roles: aResults[1],
                        workPackages: aResults[2],
                        resourceDemand: aResults[3]
                    };
                }.bind(this));
            }, this);

            return Promise.all(aPromises)
                .then(function () {
                    oList.setBusy(false);
                    return this._getSelectedFromCache(aListContexts);
                }.bind(this))
                .catch(function (oError) {
                    oList.setBusy(false);
                    MessageBox.error("Error al obtener el detalle de los proyectos seleccionados: " + oError.message);
                });
        },

        // Arma el array final leyendo todo desde cache (nuevo + ya existente)
        _getSelectedFromCache: function (aListContexts) {
            this._aFullProjectData = aListContexts.map(function (oContext) {
                var sProjectId = oContext.getProperty("ProjectID");
                return Object.assign(
                    { ProjectID: sProjectId },
                    this._oProjectDataCache[sProjectId]
                );
            }, this);
            return this._aFullProjectData;
        },

        _readList: function (oModel, sEntitySet, sFilterField, sValue) {
            var oBinding = oModel.bindList(
                sEntitySet,
                null,
                [],
                [new Filter(sFilterField, FilterOperator.EQ, sValue)],
                { $$groupId: "$direct" }
            );

            // requestContexts exige iLength >= 0; usar -1 lanza "Illegal length -1"
            return oBinding.requestContexts(0, 100000).then(function (aContexts) {
                return aContexts.map(function (oContext) {
                    return oContext.getObject();
                });
            });
        },

        onCopy: async function (oEvent) {

            if (!this._aFullProjectData || !this._aFullProjectData.length) {
                MessageBox.warning("Selecciona al menos un proyecto y espera a que carguen los datos.");
                return;
            }

            var that = this;
            var oBotonOrigen = oEvent.getSource(); // ← capturado YA, antes del confirm async

            MessageBox.confirm("¿Está seguro de crear el/los proyecto(s)?", {
                title: "Confirmar creación",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: async function (sAction) {
                    if (sAction !== MessageBox.Action.YES) {
                        return;
                    }

                    var nTotal = that._aFullProjectData.length;

                    if (!that._oBusyDialog) {
                        that._oBusyDialog = new sap.m.BusyDialog({
                            title: "Copiando Proyectos",
                            text: ""
                        });
                    }

                    that._oBusyDialog.open();

                    var sEndpoint = "/sap/opu/odata4/sap/zsrv_project_entry/srvd/sap/zsrv_project_entry/0001/Project";
                    var aResultados = [];
                    var sToken = null;

                    try {
                        for (var i = 0; i < nTotal; i++) {
                            that._oBusyDialog.setText("Procesando " + (i + 1) + " de " + nTotal + "...");

                            var oProjectData = that._aFullProjectData[i];

                            var sNuevoProjectId = await that._obtenerProjectID();

                            oProjectData.header = Object.assign({}, oProjectData.header, {
                                ProjectID: sNuevoProjectId
                            });
                            oProjectData.newProjectId = sNuevoProjectId;

                            var oBody = that._buildProjectBody(oProjectData);
                            var sPayloadApi = btoa(JSON.stringify(oBody));

                            var oPayloadBase64 = {
                                projectId: sNuevoProjectId,
                                body: sPayloadApi,
                                urlApi: "/sap/opu/odata/CPD/SC_PROJ_ENGMT_CREATE_UPD_SRV/ProjectSet",
                                urlMet: "/sap/opu/odata/CPD/SC_EXTERNAL_SERVICES_SRV/$metadata",
                                entidad: "Project"
                            };

                            var proyectos = oProjectData.ProjectID + "-" + sNuevoProjectId;

                            try {
                                var oResultado = await that._postODataV4(sEndpoint, oPayloadBase64, sToken);
                                sToken = oResultado.token;

                                aResultados.push({
                                    projectId: proyectos,
                                    ok: true,
                                    mensaje: oResultado.mensaje
                                });

                            } catch (oErrorProyecto) {
                                sToken = oErrorProyecto.token || null;

                                aResultados.push({
                                    projectId: proyectos,
                                    ok: false,
                                    mensaje: oErrorProyecto.mensaje
                                });
                            }
                        }

                    } finally {
                        that._oBusyDialog.close();
                    }

                    that._mostrarResumenCreacion(aResultados, oBotonOrigen);
                }
            });
        },

        _obtenerProjectID: async function () {
            var sUrl = "/sap/opu/odata4/sap/zsrv_project_entry/srvd/sap/zsrv_project_entry/0001/NewProject";

            try {
                var response = await fetch(sUrl, {
                    method: "GET",
                    headers: { "Accept": "application/json" }
                });

                if (!response.ok) {
                    throw new Error("HTTP " + response.status + " al consultar NewProject");
                }

                var data = await response.json();
                var vProjectId = data?.value?.[0]?.ProjectID;

                if (vProjectId !== undefined && vProjectId !== null) {
                    vProjectId = String(vProjectId).trim();
                } else {
                    MessageBox.warning("No se pudo determinar el próximo ProjectID; se usará el valor por defecto.");
                }

            } catch (oError) {
                MessageBox.error("Error al obtener el próximo ProjectID: " + oError.message);
                // Se mantiene sProjectId = "1" como fallback, pero el usuario queda avisado
            }

            return vProjectId;
        },

        _buildProjectBody: function (oProjectData) {
            var oHeader = oProjectData?.header[0] || {};
            var aRoles = oProjectData.roles || [];
            var aWorkPackages = oProjectData.workPackages || [];
            var aDemand = oProjectData.resourceDemand || [];

            var sProjectId = oProjectData.newProjectId;
            var i, j;

            // El DemandSet destino cuelga de cada WorkPackage; agrupamos la
            // demanda leída (a nivel de proyecto) por WorkPackageID para
            // poder anidarla correctamente en cada work package.
            var mDemandByWorkPackage = {};
            for (i = 0; i < aDemand.length; i++) {
                var oDemandItem = aDemand[i];

                // El WorkPackageID viene como "<projectIdViejo>.<consecutivo>".
                // Reemplazamos lo que está antes del primer "." por el nuevo
                // ProjectID (sProjectId), conservando el consecutivo original.
                if (oDemandItem.WorkPackage && oDemandItem.WorkPackage.indexOf(".") !== -1) {
                    var sWpSuffix = oDemandItem.WorkPackage.substring(
                        oDemandItem.WorkPackage.indexOf(".") + 1
                    );
                    oDemandItem.WorkPackage = sProjectId + "." + sWpSuffix;
                }
                var sDemandWpId = oDemandItem.WorkPackage;
                if (!mDemandByWorkPackage[sDemandWpId]) {
                    mDemandByWorkPackage[sDemandWpId] = [];
                }
                mDemandByWorkPackage[sDemandWpId].push(oDemandItem);
            }

            // --- ProjectRoleSet ---
            var aProjectRoleResults = [];
            for (i = 0; i < aRoles.length; i++) {
                var oRole = aRoles[i];
                aProjectRoleResults.push({
                    ProjectID: sProjectId,
                    ProjectRoleID: oRole.ProjectRoleID,
                    BusinessPartnerID: oRole.BusinessPartnerID
                });
            }

            // --- WorkPackageSet (con DemandSet anidado por cada work package) ---
            var aWorkPackageResults = [];
            for (i = 0; i < aWorkPackages.length; i++) {
                var oWp = aWorkPackages[i];
                var sWpId = oWp.WorkPackageID;
                if (sWpId && sWpId.indexOf(".") !== -1) {
                    var sWpSuffix = sWpId.substring(
                        sWpId.indexOf(".") + 1
                    );
                    sWpId = sProjectId + "." + sWpSuffix;
                }
                var aWpDemand = mDemandByWorkPackage[sWpId] || [];

                var aDemandResults = [];
                for (j = 0; j < aWpDemand.length; j++) {
                    var oDemand = aWpDemand[j];
                    aDemandResults.push({
                        WorkPackage: sWpId,
                        ResourceDemand: oWp.ResourceDemand,
                        Version: oWp.Version,
                        EngagementProject: oWp.EngagementProject,
                        WorkItem: oWp.WorkItem,
                        BillingControlCategory: oWp.BillingControlCategory,
                        DeliveryOrganization: oWp.DeliveryOrganization,
                        EngagementProjectResourceType: oWp.EngagementProjectResourceType,
                        EngagementProjectResource: oWp.EngagementProjectResource,
                        WorkforcePersonUserID: oWp.WorkforcePersonUserID,
                        PersonWorkAgreement: oWp.PersonWorkAgreement,
                        ResourceDemandStatus: oWp.ResourceDemandStatus,
                        UnitOfMeasure: oWp.UnitOfMeasure,
                        Quantity: oWp.Quantity,

                    });
                }

                aWorkPackageResults.push({
                    ProjectID: sProjectId,
                    WorkPackageID: sWpId,
                    WorkPackageName: oWp.WorkPackageName,
                    //  Description: oWp.Description,
                    WPStartDate: this._toODataDate(oWp.WPStartDate),
                    WPEndDate: this._toODataDate(oWp.WPEndDate),
                    WorkPackageType: oWp.WorkPackageType,
                    YY1_TipodeproyectoSub_cpd: oWp.YY1_TipodeproyectoSub_cpd,
                    YY1_TipodeproyectoSub_cpdF: oWp.YY1_TipodeproyectoSub_cpdF,
                    YY1_TipodeproyectoSub_cpdT: oWp.YY1_TipodeproyectoSub_cpdT,
                    //     UnitQuantity: oWp.UnitQuantity,
                    //     UnitId: oWp.UnitId,
                    to_ResourceDemand: {
                        results: aDemandResults
                    }
                    // WorkItemSet y WorkPackageFunctionSet no se mapean aquí
                    // porque tu lectura actual (_loadFullProjectData) no los
                    // consulta. Si los necesitas, hay que agregar otro
                    // _readList() para cada uno y anidarlos igual que DemandSet.
                });
            }
            debugger;
            return {
                ProjectID: sProjectId,
                ProjectName: oHeader.ProjectName,
                ProjectStage: 'P001',
                OrgID: oHeader.OrgID,
                ProjectCategory: oHeader.ProjectCategory,
                Currency: oHeader.Currency,
                StartDate: this._toODataDate(oHeader.StartDate),
                EndDate: this._toODataDate(oHeader.EndDate),
                ProjManagerExtId: oHeader.ProjManagerExtId,
                //  ProjManagerCompCode: oHeader.ProjManagerCompCode,
                Customer: oHeader.Customer,
                CostCenter: oHeader.CostCenter,
                ProfitCenter: oHeader.ProfitCenter,
                ProjAccountantExtId: oHeader.ProjAccountantExtId,
                //       ProjAccountantCompCode: oHeader.ProjAccountantCompCode,
                ProjControllerExtId: oHeader.ProjControllerExtId,
                //     ProjControllerCompCode: oHeader.ProjControllerCompCode,
                ProjPartnerExtId: oHeader.ProjPartnerExtId,
                //   ProjPartnerCompCode: oHeader.ProjPartnerCompCode,
                //   ProjectDesc: oHeader.ProjectDesc,
                Confidential: oHeader.Confidential,
                UseProjectBilling: oHeader.UseProjectBilling,
                RestrictTimePosting: oHeader.RestrictTimePosting,
                YY1_ACTIVE_Cpr: oHeader.YY1_ACTIVE_Cpr,
                //   YY1_ACTIVE_CprF: oHeader.YY1_ACTIVE_CprF,
                YY1_ACTIVE_CprT: oHeader.YY1_ACTIVE_CprT,
                YY1_Fechadeventa_Cpr: this._toODataDate(oHeader.YY1_Fechadeventa_Cpr),
                //  YY1_Fechadeventa_CprF: oHeader.YY1_Fechadeventa_CprF,
                YY1_Geografia_Cpr: oHeader.YY1_Geografia_Cpr,
                // YY1_Geografia_CprF: oHeader.YY1_Geografia_CprF,
                YY1_Geografia_CprT: oHeader.YY1_Geografia_CprT,
                YY1_IDOPORTUNIDAD_Cpr: oHeader.YY1_IDOPORTUNIDAD_Cpr,
                //  YY1_IDOPORTUNIDAD_CprF: oHeader.YY1_IDOPORTUNIDAD_CprF,
                YY1_Producto_Cpr: oHeader.YY1_Producto_Cpr,
                // YY1_Producto_CprF: oHeader.YY1_Producto_CprF,
                YY1_Producto_CprT: oHeader.YY1_Producto_CprT,
                YY1_Tipodeproyecto_Cpr: oHeader.YY1_Tipodeproyecto_Cpr,
                //     YY1_Tipodeproyecto_CprF: oHeader.YY1_Tipodeproyecto_CprF,
                YY1_Tipodeproyecto_CprT: oHeader.YY1_Tipodeproyecto_CprT,
                ProjectRoleSet: {
                    results: aProjectRoleResults
                },
                WorkPackageSet: {
                    results: aWorkPackageResults
                }
            };
        },

        _toODataDate: function (vDate) {
            if (!vDate) {
                return null;
            }

            var oDate;

            if (vDate instanceof Date) {
                oDate = vDate;
            } else if (typeof vDate === "string") {
                // Formato OData V2: "/Date(1703635200000)/" (o con offset "/Date(ms+0000)/")
                var oMatch = vDate.match(/^\/Date\((-?\d+)([+-]\d+)?\)\/$/);
                if (oMatch) {
                    oDate = new Date(parseInt(oMatch[1], 10));
                } else {
                    oDate = new Date(vDate);
                }
            } else {
                oDate = new Date(vDate);
            }

            if (isNaN(oDate.getTime())) {
                return null;
            }

            var pad = function (n) {
                return (n < 10 ? "0" : "") + n;
            };

            return oDate.getFullYear() + "-" +
                pad(oDate.getMonth() + 1) + "-" +
                pad(oDate.getDate()) + "T" +
                pad(oDate.getHours()) + ":" +
                pad(oDate.getMinutes()) + ":" +
                pad(oDate.getSeconds());
        },

        _toBase64Utf8: function (sText) {
            // encodeURIComponent + unescape es el truco clásico para
            // convertir un string UTF-16 (JS) a una secuencia de bytes
            // Latin1 que btoa() sí puede procesar sin perder caracteres.
            return btoa(unescape(encodeURIComponent(sText)));
        },

        /**
         * Obtiene un CSRF token nuevo contra el servicio OData V4 indicado.
         * Separado de _postODataV4 para poder reutilizar el mismo token
         * en varias llamadas POST sin pedir uno nuevo cada vez.
         */
        _getCsrfToken: function (sMetadataUrl) {
            return new Promise(function (resolve, reject) {
                $.ajax({
                    url: sMetadataUrl,
                    method: "GET",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: function (data, status, oXHR) {
                        var sToken = oXHR.getResponseHeader("X-CSRF-Token");
                        if (!sToken) {
                            reject(new Error("El servidor no devolvió X-CSRF-Token."));
                            return;
                        }
                        resolve(sToken);
                    },
                    error: function (oError) {
                        reject(oError);
                    }
                });
            });
        },

        /**
         * Extrae un mensaje legible tanto del header "sap-messages" como
         * del formato estándar de error OData ({ error: { message: {...} } }),
         * para no perder información según cuál use el backend.
         */
        _extractODataMessage: function (oXHR) {
            // 1. Header sap-messages (formato usado en tu ejemplo original)
            try {
                var sSapMessages = oXHR.getResponseHeader && oXHR.getResponseHeader("sap-messages");
                if (sSapMessages) {
                    var aMessages = JSON.parse(sSapMessages).reverse();
                    return {
                        mensaje: aMessages.map(function (o) { return o.message; }).join(" | "),
                        numericSeverity: aMessages[0]?.numericSeverity
                    };
                }
            } catch (e) {
                console.warn("No se pudo parsear sap-messages:", e);
            }

            // 2. Body de error estándar OData (para el caso de error HTTP, oXHR.responseText)
            try {
                var oBody = JSON.parse(oXHR.responseText);
                var sMsg = oBody?.error?.message?.value || oBody?.error?.message;
                if (sMsg) {
                    return { mensaje: sMsg, numericSeverity: 4 };
                }
            } catch (e) {
                // responseText no era JSON válido, se ignora
            }

            return { mensaje: "Error desconocido (HTTP " + oXHR.status + ")", numericSeverity: 4 };
        },

        /**
         * POST genérico contra el servicio OData V4, reutilizando un
         * CSRF token si ya se tiene uno (evita pedirlo de nuevo por cada
         * proyecto cuando se procesan varios en secuencia).
         */
        _postODataV4: async function (sEndpoint, oBody, sTokenExistente) {
            var sToken = sTokenExistente;

            if (!sToken) {
                sToken = await this._getCsrfToken(
                    "/sap/opu/odata4/sap/zsrv_project_entry/srvd/sap/zsrv_project_entry/0001/$metadata"
                );
            }

            var that = this;

            return new Promise(function (resolve, reject) {
                $.ajax({
                    url: sEndpoint,
                    method: "POST",
                    contentType: "application/json",
                    headers: {
                        "X-CSRF-Token": sToken,
                        "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    data: JSON.stringify(oBody),
                    success: function (oResponse) {
                        resolve({
                            mensaje: "Proyecto creado exitosamente",
                            numericSeverity: 1,
                            id: oResponse?.id || oResponse?.projectId,
                            token: sToken // se devuelve para reutilizarlo en la siguiente llamada
                        });
                    },
                    error: function (oXHR) {
                        var oMsg = that._extractODataMessage(oXHR);
                        reject(Object.assign(oMsg, { token: sToken }));
                    }
                });
            });
        },

        _toBase64Utf8: function (sText) {
            // encodeURIComponent + unescape es el truco clásico para
            // convertir un string UTF-16 (JS) a una secuencia de bytes
            // Latin1 que btoa() sí puede procesar sin perder caracteres.
            return btoa(unescape(encodeURIComponent(sText)));
        },

        /**
         * Obtiene un CSRF token nuevo contra el servicio OData V4 indicado.
         * Separado de _postODataV4 para poder reutilizar el mismo token
         * en varias llamadas POST sin pedir uno nuevo cada vez.
         */
        _getCsrfToken: function (sMetadataUrl) {
            return new Promise(function (resolve, reject) {
                $.ajax({
                    url: sMetadataUrl,
                    method: "GET",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    },
                    success: function (data, status, oXHR) {
                        var sToken = oXHR.getResponseHeader("X-CSRF-Token");
                        if (!sToken) {
                            reject(new Error("El servidor no devolvió X-CSRF-Token."));
                            return;
                        }
                        resolve(sToken);
                    },
                    error: function (oError) {
                        reject(oError);
                    }
                });
            });
        },

        /**
         * Extrae un mensaje legible tanto del header "sap-messages" como
         * del formato estándar de error OData ({ error: { message: {...} } }),
         * para no perder información según cuál use el backend.
         */
        _extractODataMessage: function (oXHR) {
            // 1. Header sap-messages (formato usado en tu ejemplo original)
            try {
                var sSapMessages = oXHR.getResponseHeader && oXHR.getResponseHeader("sap-messages");
                if (sSapMessages) {
                    var aMessages = JSON.parse(sSapMessages).reverse();
                    return {
                        mensaje: aMessages.map(function (o) { return o.message; }).join(" | "),
                        numericSeverity: aMessages[0]?.numericSeverity
                    };
                }
            } catch (e) {
                console.warn("No se pudo parsear sap-messages:", e);
            }

            // 2. Body de error estándar OData (para el caso de error HTTP, oXHR.responseText)
            try {
                var oBody = JSON.parse(oXHR.responseText);
                var sMsg = oBody?.error?.message?.value || oBody?.error?.message;
                if (sMsg) {
                    return { mensaje: sMsg, numericSeverity: 4 };
                }
            } catch (e) {
                // responseText no era JSON válido, se ignora
            }

            return { mensaje: "Error desconocido (HTTP " + oXHR.status + ")", numericSeverity: 4 };
        },

        /**
         * POST genérico contra el servicio OData V4, reutilizando un
         * CSRF token si ya se tiene uno (evita pedirlo de nuevo por cada
         * proyecto cuando se procesan varios en secuencia).
         */
        _postODataV4: async function (sEndpoint, oBody, sTokenExistente) {
            var sToken = sTokenExistente;

            if (!sToken) {
                sToken = await this._getCsrfToken(
                    "/sap/opu/odata4/sap/zsrv_project_entry/srvd/sap/zsrv_project_entry/0001/$metadata"
                );
            }

            var that = this;

            return new Promise(function (resolve, reject) {
                $.ajax({
                    url: sEndpoint,
                    method: "POST",
                    contentType: "application/json",
                    headers: {
                        "X-CSRF-Token": sToken,
                        "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest"
                    },
                    data: JSON.stringify(oBody),
                    success: function (oResponse, sStatus, oXHR) {
                        var oParsed = that._parseSapMessages(oXHR);

                        // Si vino sap-messages y su severidad máxima es error/abort,
                        // esto es un fallo de negocio aunque el HTTP haya sido 200/201.
                        if (oParsed && oParsed.numericSeverity >= SAP_SEVERITY.ERROR) {
                            reject(Object.assign(oParsed, { token: sToken }));
                            return;
                        }

                        resolve({
                            mensaje: oParsed ? oParsed.mensaje : "Proyecto creado exitosamente",
                            numericSeverity: oParsed ? oParsed.numericSeverity : SAP_SEVERITY.SUCCESS,
                            id: oResponse?.id || oResponse?.projectId,
                            token: sToken // se devuelve para reutilizarlo en la siguiente llamada
                        });
                    },
                    error: function (oXHR) {
                        var oMsg = that._extractODataMessage(oXHR);
                        reject(Object.assign(oMsg, { token: sToken }));
                    }
                });
            });
        },

        _parseSapMessages: function (oXHR) {
            try {
                var sSapMessages = oXHR.getResponseHeader && oXHR.getResponseHeader("sap-messages");
                if (!sSapMessages) {
                    return null;
                }

                var aMessages = JSON.parse(sSapMessages);
                if (!aMessages.length) {
                    return null;
                }

                var nMaxSeverity = aMessages.reduce(function (nMax, oMsg) {
                    return Math.max(nMax, Number(oMsg.numericSeverity) || 0);
                }, 0);

                return {
                    mensaje: aMessages.map(function (o) { return o.message; }).join(" | "),
                    numericSeverity: nMaxSeverity,
                    mensajesDetalle: aMessages
                };

            } catch (e) {
                console.warn("No se pudo parsear sap-messages:", e);
                return null;
            }
        },

        _mostrarResumenCreacion: function (aResultados, oOpenerControl) {
            var nOk = aResultados.filter(function (r) { return r.ok; }).length;
            var nError = aResultados.length - nOk;

            var aItems = aResultados.map(function (r) {
                return new MessageItem({
                    type: r.ok ? "Success" : "Error",
                    title: r.projectId,
                    subtitle: r.ok ? "Creado correctamente" : "Error en la creación",
                    description: r.mensaje,
                    counter: 0
                });
            });

            if (!this._oMessageView) {
                this._oMessageView = new MessageView({
                    showDetailPage: true,
                    itemSelect: function () { }
                });

                this._oResumenText = new Text();

                this._oMessagePopover = new Popover({
                    title: "Resultado de la creación",
                    contentWidth: "440px",
                    contentHeight: "400px",
                    verticalScrolling: false,
                    content: [this._oMessageView],
                    customHeader: new Bar({
                        contentMiddle: [this._oResumenText]
                    }),
                    endButton: new Button({
                        icon: "sap-icon://decline",
                        press: function () {
                            this._oMessagePopover.close();
                        }.bind(this)
                    })
                });
            }

            // Limpiar ítems previos y agregar los nuevos
            this._oMessageView.destroyItems();
            aItems.forEach(function (oItem) {
                this._oMessageView.addItem(oItem);
            }.bind(this));

            this._oResumenText.setText(nOk + " correcto(s) · " + nError + " con error");

            this._oMessageView.navigateBack();
            this._oMessagePopover.openBy(oOpenerControl);
        },

        onSelectAll: function (oEvent) {
            var oList = this.byId("proyectosList");
            var oButton = oEvent.getSource();

            oList.selectAll();

            this.onSelectionChange();
        },

        onDeselectAll: function (oEvent) {
            var oList = this.byId("proyectosList");
            var oButton = oEvent.getSource();

            oList.removeSelections(true);

            this.onSelectionChange();
        },

        onSearch: function (oEvent) {
            var sQuery = oEvent.getParameter("newValue");

            this._oFilterState.search = sQuery ? [
                new Filter({
                    filters: [
                        new Filter("ProjectID", FilterOperator.Contains, sQuery),
                        new Filter("ProjectName", FilterOperator.Contains, sQuery)
                    ],
                    and: true
                })
            ] : [];

            this._applyFilters();
        },

        onPerfilProyectoChange: function (oEvent) {
            /*
            var aSelectedKeys = oEvent.getSource().getSelectedKeys();

            // AJUSTAR: reemplazar por el nombre real del campo y los valores reales
            var mPerfilMap = {
                gastosGenerales: "Z1",
                proyectoIngresos: "Z2",
                proyectoInversion: "Z3",
                proyectoEstadistico: "Z4"
            };

            this._oFilterState.perfilProyecto = aSelectedKeys.length ? [
                new Filter({
                    filters: aSelectedKeys.map(function (sKey) {
                        return new Filter("ProjectCategory", FilterOperator.EQ, mPerfilMap[sKey]);
                    }),
                    and: false
                })
            ] : [];

            this._applyFilters();
            */
        },

        onEstadoProcesamientoChange: function (oEvent) {
            var aSelectedKeys = oEvent.getSource().getSelectedKeys();

            // AJUSTAR: reemplazar por el nombre real del campo y los valores reales
            var mEstadoMap = {
                Planificado: "P001",
                Preparacion: "P002",
                Ejecucion: "P003",
                Completado: "P004",
                
            };

            this._oFilterState.estadoProcesamiento = aSelectedKeys.length ? [
                new Filter({
                    filters: aSelectedKeys.map(function (sKey) {
                        return new Filter("ProjectStage", FilterOperator.EQ, mEstadoMap[sKey]);
                    }),
                    and: false
                })
            ] : [];

            this._applyFilters();
        },

        _applyFilters: function () {
            var aCombined = []
                .concat(this._oFilterState.search)
                .concat(this._oFilterState.perfilProyecto)
                .concat(this._oFilterState.estadoProcesamiento);

            this._oList.getBinding("items").filter(aCombined);
        }

    });
});