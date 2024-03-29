/*
 ***** BEGIN LICENSE BLOCK *****
 * This file is inspired by FiltaQuilla, Custom Filter Actions
 * rereleased by Axel Grude (original project by R Kent James
 * under the Mesquilla Project)
 *
 * Mailing List Filter is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * You should have received a copy of the GNU General Public License
 * along with FiltaQuilla.  If not, see <http://www.gnu.org/licenses/>.
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * Contributors: Martin Pecka
 *
 ***** END LICENSE BLOCK *****
 */

"use strict";

// replaces filterEditorOverlay.xul and bindings.xml

{
  const Ci = Components.interfaces;
  const Cc = Components.classes;

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
          let newMenuItem = document.createXULElement('menuitem');
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

function onLoad(activatedWhileWindowOpen) {
}

function onUnload(isAddOnShutown) {
  window.mlf_observer.disconnect();
}