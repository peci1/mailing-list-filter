/* eslint-disable object-shorthand */

"use strict";

// Using a closure to not leak anything but the API to the outside world.
(function (exports) {

  const { ExtensionSupport } = ChromeUtils.importESModule(
    'resource:///modules/ExtensionSupport.sys.mjs'
  );

  const headerParser = Cc["@mozilla.org/messenger/headerparser;1"]
    .getService(Ci.nsIMsgHeaderParser);
  const abManager = Cc["@mozilla.org/abmanager;1"]
    .getService(Ci.nsIAbManager);
  const filterService = Cc["@mozilla.org/messenger/services/filters;1"]
    .getService(Ci.nsIMsgFilterService);

  const addonId = "mailing-list-filter@peci1.cz"
  const nsMsgSearchOp = Ci.nsMsgSearchOp;
  const IsInAB = nsMsgSearchOp.IsInAB;
  const IsntInAB = nsMsgSearchOp.IsntInAB;

  function onLoadMessenger(window, extension) {
    // CustomTerms are not removable, we cannot change the definition through an
    // update, but we can change the implementation. We do this by loading the 
    // implementation into every messenger window and let the definition search
    // for the implementation in the most recent window. This way the connection
    // between definition and implementation is not fixed, but survives reloads.
    window.MailingListFilter = {}
    const self = window.MailingListFilter;

    self._extensionEnabled = true;
    Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter._extensionEnabled = true;

    self._init = function(extension)
    {
      // is this search scope local, and therefore valid for db-based terms?
      self._isLocalSearch = function (aSearchScope)
      {
        switch (aSearchScope) {
          case Ci.nsMsgSearchScope.offlineMail:
          case Ci.nsMsgSearchScope.offlineMailFilter:
          case Ci.nsMsgSearchScope.onlineMailFilter:
          case Ci.nsMsgSearchScope.localNews:
            return true;
          default:
            return false;
        }
      }

      self.match = function mailingList_match(aMsgHdr, aSearchValue, aSearchOp, searchRecipients)
      {
        if (!Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter._extensionEnabled)
          return false;

        let dir = abManager.getDirectory(aSearchValue);
        if (!dir) {
          Cu.reportError("During filter action, can't find directory: " + aSearchValue);
          return;
        }
  
        let addressesString = aMsgHdr.author;
        if (searchRecipients)
            addressesString = aMsgHdr.recipients + "," + aMsgHdr.ccList;
        let addresses = headerParser.parseEncodedHeader(addressesString);
  
        let matches = false;
  
        for (const address of addresses) {
          if (dir.isMailList) {
            // unfortunately cardForEmailAddress doesn't work as expected for mailing lists
            for (let card of dir.childCards) {
              if (card.hasEmailAddress(address.email)) {
                matches = true;
                break;
              }
            }
          } else {
            matches = (dir.cardForEmailAddress(address.email) !== null);
          }
        }
  
        if (aSearchOp === IsInAB)
            return matches;
        else
            return !matches;
      };
  
      self.mailingList_getEnabled = self.mailingList_getAvailable = function (scope, op)
      {
          return Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter._extensionEnabled
              && self._isLocalSearch(scope);
      };
  
      self.mailingList_getAvailableOperators = function (scope)
      {
          if (!self._isLocalSearch(scope))
          {
            return [];
          }
          return [IsInAB, IsntInAB];
      };
  
      // search in mailing list by author
      self.mailingList = 
      {
        id: "mailing-list-filter@peci1.cz#mailingList",
        name: extension.localeData.localizeMessage("term-name"),
        getEnabled: Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.mailingList_getEnabled,
        needsBody: false,
        getAvailable: Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.mailingList_getAvailable,
        getAvailableOperators: Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.mailingList_getAvailableOperators,
        match: function(aMsgHdr, aSearchValue, aSearchOp)
        {
            return Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.match(aMsgHdr, aSearchValue, aSearchOp, false);
        }
      };
  
      // search in mailing list by recipients
      self.mailingListRecipients = 
      {
        id: "mailing-list-filter@peci1.cz#mailingListRecipients",
        name: extension.localeData.localizeMessage("term-recipients-name"),
        getEnabled: Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.mailingList_getEnabled,
        needsBody: false,
        getAvailable: Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.mailingList_getAvailable,
        getAvailableOperators: Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.mailingList_getAvailableOperators,
        match: function(aMsgHdr, aSearchValue, aSearchOp)
        {
            return Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter.match(aMsgHdr, aSearchValue, aSearchOp, true);
        }
      };
    };

    self._init(extension);

    if (!filterService.getCustomTerm(self.mailingList.id)) {
      filterService.addCustomTerm(self.mailingList);
    }

    if (!filterService.getCustomTerm(self.mailingListRecipients.id)) {
      filterService.addCustomTerm(self.mailingListRecipients);
    }
    console.log("MailingListFilter loaded.");
  }
  function onUnloadMessenger(window) {
    window.MailingListFilter._extensionEnabled = false;
    Services.wm.getMostRecentWindow("mail:3pane").MailingListFilter._extensionEnabled = false;
    console.log("MailingListFilter unloaded.");
  }

  function onLoadFilter(window, extension) {
    function patchMailingListSelector(es) {
      function updateSearchValue(menulist) {
        let target = this.closest(".search-value-custom");
        if (target) {
          target.setAttribute("value", menulist.value);
          // The AssignMeaningfulName functions uses the item's js value, so set
          // this to allow this to be shown correctly.
          target.value = menulist.getAttribute('label');
        }
        else {
          console.log("cannot update search value for menulist:")
          console.log(menulist);
        }
      }
  
      function addDirectories(aDirEnum, aMenupopup) {
        let uris = Array()
        for (let dir of aDirEnum) {
          if (dir instanceof Ci.nsIAbDirectory)
          {
            // get children
            let newMenuItem = window.document.createXULElement('menuitem');
            let displayLabel = dir.dirName;
            if (dir.isMailList)
              displayLabel = "--" + displayLabel;
            newMenuItem.setAttribute('label', displayLabel);
            newMenuItem.setAttribute('value', dir.URI);
            aMenupopup.appendChild(newMenuItem);
            uris.push(dir.URI)
            // recursive add of child mailing lists
            let subUris = addDirectories(dir.childNodes, aMenupopup);
            uris = uris.concat(subUris);
          }
          else {
            console.log("Wrong type:");
            console.log(dir);
          }
        }
        return uris;
      }
  
      console.log("patchMailingListSelector()");
  
      if (es.firstChild && es.firstChild.classList.contains("mlf-tag")) return true;
      if (es.firstChild) es.removeChild(es.firstChild);
      try {
        let wrapper = es.closest("search-value"),
          menulistFragment = window.MozXULElement.parseXULToFragment(`
          <menulist flex="1" class="search-value-menulist flexinput mlf-tag" inherits="disabled"
                    oncommand="this.parentNode.updateSearchValue(this);">
            <menupopup class="search-value-popup"></menupopup>
          </menulist>
        `);
        // dropdown selected, then we haven't got the container <hbox class="search-value-custom" />
  
        es.appendChild(menulistFragment);
        es.classList.add("flexelementcontainer");
        es.updateSearchValue = updateSearchValue;
  
        let value = es.getAttribute("value"),
          menulist = es.getElementsByTagName("menulist")[0],
          menuPopup = es.lastChild.getElementsByTagName("menupopup")[0];
  
        // set the default to the personal address book
        if (!value || !value.length)
          value = "jsaddrbook://abook.sqlite";
  
        // recursively add all address books and email lists
        let abManager = Cc["@mozilla.org/abmanager;1"].getService(Ci.nsIAbManager);
        let uris = addDirectories(abManager.directories, menuPopup);
  
        menulist.setAttribute('value', value);
        menulist.selectedIndex = uris.indexOf(value);
  
        es.setAttribute("value", value);
        es.value = value;
        es.updateSearchValue(menulist);
        es.setAttribute('mlf-patched', "true");
        return true;
      }
      catch(ex) {
        console.log(ex);
        return false;
      }
  
    }
  
    function patchSearchValue(es) {
      let attType = es.getAttribute('searchAttribute'),
        isPatched = false;
      if (!attType.startsWith("mailing-list-filter@")) return;
  
      switch(attType) {
        case "mailing-list-filter@peci1.cz#mailingList":  // fall-through
        case "mailing-list-filter@peci1.cz#mailingListRecipients":
          isPatched = patchMailingListSelector(es)
          break;
        default:
        // irrelevant
      }
      if (isPatched)
        console.log("Mailing list filter patched: " + es);
    }

    function callbackMailingListSearchCondition(mutationList, observer) {
      mutationList.forEach( (mutation) => {
        switch(mutation.type) {
          case 'childList':
            {
              /* One or more children have been added to and/or removed
                 from the tree.
                 (See mutation.addedNodes and mutation.removedNodes.) */
              // iterate nodelist of added nodes
              let nList = mutation.addedNodes;
              nList.forEach((el) => {
                if (!el.querySelectorAll) return; // leave the anonymous function, this continues with the next forEach
                let hbox = el.querySelectorAll("hbox.search-value-custom");
                hbox.forEach(patchSearchValue);
              });
            }
            break;
          case "attributes":
            {
              let es = mutation.target;
              if (es.classList.contains("search-value-custom"))
                patchSearchValue(es);
            }
            break;
        }
      });
    }
  
    // watch out for custom conditions being added to the top list.
    // or the searchAttribute changing to something that matches
    window.mlf_observer = new window.MutationObserver(callbackMailingListSearchCondition);
  
    const mlf_observerOptions = {
      childList: true,
      attributes: true,
      subtree: true // Omit (or set to false) to observe only changes to the parent node
    }
  
    let termList = window.document.querySelector('#searchTermList')
    window.mlf_observer.observe(termList, mlf_observerOptions);
    // Trigger the callback for already existing elements
    termList.querySelectorAll('.search-value-custom').forEach(patchSearchValue);
  
    console.log("Mailing List Filter loaded.");
  }
  function onUnloadFilter(window) {
    window.mlf_observer.disconnect();
  }

  class MailingListFilter extends ExtensionCommon.ExtensionAPI {
    getAPI(context) {
      return {
        MailingListFilter: {},
      };
    }

    onStartup() {
      const { extension } = this;
      ExtensionSupport.registerWindowListener(addonId, {
        onLoadWindow: function (window) {
          if ([
            "chrome://messenger/content/messenger.xhtml",
          ].includes(window.location.href)) {
            onLoadMessenger(window, extension)
          }
  
          if ([
            "chrome://messenger/content/FilterEditor.xhtml",
            "chrome://messenger/content/SearchDialog.xhtml"
          ].includes(window.location.href)) {
            onLoadFilter(window, extension)
          }
        },
      });
    }

    onShutdown(isAppShutdown) {
      if (isAppShutdown) {
        return;
      }

      for (let window of ExtensionSupport.openWindows) {
        if ([
          "chrome://messenger/content/messenger.xhtml",
        ].includes(window.location.href)) {
          onUnloadMessenger(window)
        }

        if ([
          "chrome://messenger/content/FilterEditor.xhtml",
          "chrome://messenger/content/SearchDialog.xhtml"
        ].includes(window.location.href)) {
          onUnloadFilter(window)
        }
      }

      ExtensionSupport.unregisterWindowListener(addonId);

      // Flush all caches.
      Services.obs.notifyObservers(null, "startupcache-invalidate");
    }
  };

  // Export the api by assigning in to the exports parameter of the anonymous
  // closure function, which is the global this.
  exports.MailingListFilter = MailingListFilter;

})(this)
